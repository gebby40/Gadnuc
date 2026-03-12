'use client';

import { useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '../../../../../../components/AuthProvider';
import { tenantPost } from '../../../../../../lib/api';
import Papa from 'papaparse';

const REQUIRED_FIELDS = ['sku', 'name', 'price_cents'] as const;
const ALL_FIELDS = ['sku', 'name', 'description', 'category', 'price_cents', 'stock_qty', 'low_stock_threshold', 'image_url', 'is_active'] as const;

type Step = 'upload' | 'preview' | 'importing' | 'results';

interface ParsedRow {
  [key: string]: string;
}

interface ValidatedRow {
  sku: string;
  name: string;
  description?: string;
  category?: string;
  price_cents: number;
  stock_qty: number;
  low_stock_threshold: number;
  image_url?: string;
  is_active: boolean;
}

interface RowError {
  row: number;
  error: string;
}

interface ImportResult {
  created: number;
  updated: number;
  errors: RowError[];
}

export default function CSVImportPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const { token } = useAuth();

  const [step, setStep] = useState<Step>('upload');
  const [rawRows, setRawRows] = useState<ParsedRow[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMap, setColumnMap] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<'create' | 'upsert'>('upsert');
  const [validationErrors, setValidationErrors] = useState<RowError[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState('');

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }

  function parseFile(file: File) {
    setError('');
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        if (result.errors.length > 0) {
          setError(`CSV parse error: ${result.errors[0].message}`);
          return;
        }
        if (result.data.length === 0) {
          setError('CSV file is empty');
          return;
        }
        if (result.data.length > 500) {
          setError('Maximum 500 rows per import. Please split your file.');
          return;
        }

        const headers = result.meta.fields ?? [];
        setCsvHeaders(headers);
        setRawRows(result.data as ParsedRow[]);

        // Auto-map columns by matching header names
        const map: Record<string, string> = {};
        for (const field of ALL_FIELDS) {
          const match = headers.find(h => h.toLowerCase().replace(/[\s_-]/g, '') === field.replace(/_/g, ''));
          if (match) map[field] = match;
        }
        setColumnMap(map);

        // Validate
        validateRows(result.data as ParsedRow[], map);
        setStep('preview');
      },
    });
  }

  function validateRows(rows: ParsedRow[], map: Record<string, string>): RowError[] {
    const errors: RowError[] = [];
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      for (const field of REQUIRED_FIELDS) {
        const csvCol = map[field];
        if (!csvCol || !row[csvCol]?.trim()) {
          errors.push({ row: i, error: `Missing required field: ${field}` });
        }
      }
      const priceCol = map['price_cents'];
      if (priceCol && row[priceCol]) {
        const val = Number(row[priceCol]);
        if (isNaN(val) || val < 0) {
          errors.push({ row: i, error: 'price_cents must be a non-negative number' });
        }
      }
    }
    setValidationErrors(errors);
    return errors;
  }

  function updateColumnMap(field: string, csvHeader: string) {
    const newMap = { ...columnMap, [field]: csvHeader };
    setColumnMap(newMap);
    validateRows(rawRows, newMap);
  }

  const buildRows = useCallback((): ValidatedRow[] => {
    return rawRows.map(raw => ({
      sku: (raw[columnMap.sku] ?? '').trim(),
      name: (raw[columnMap.name] ?? '').trim(),
      description: (raw[columnMap.description] ?? '').trim() || undefined,
      category: (raw[columnMap.category] ?? '').trim() || undefined,
      price_cents: parseInt(raw[columnMap.price_cents] ?? '0') || 0,
      stock_qty: parseInt(raw[columnMap.stock_qty] ?? '0') || 0,
      low_stock_threshold: parseInt(raw[columnMap.low_stock_threshold] ?? '10') || 10,
      image_url: (raw[columnMap.image_url] ?? '').trim() || undefined,
      is_active: (raw[columnMap.is_active] ?? 'true').toLowerCase() !== 'false',
    }));
  }, [rawRows, columnMap]);

  async function handleImport() {
    if (!token) return;
    setError('');
    setStep('importing');

    try {
      const rows = buildRows();
      const result = await tenantPost<ImportResult>(slug, token, '/api/products/import', { rows, mode });
      setImportResult(result);
      setStep('results');
    } catch (err: any) {
      setError(err.message ?? 'Import failed');
      setStep('preview');
    }
  }

  function downloadTemplate() {
    const csv = ALL_FIELDS.join(',') + '\n' + 'PROD-001,Example Product,A great product,General,999,100,10,,true';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'product-import-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadErrorReport() {
    if (!importResult) return;
    const errorRowSet = new Set(importResult.errors.map(e => e.row));
    const errorMap = new Map(importResult.errors.map(e => [e.row, e.error]));
    const headers = [...csvHeaders, 'import_error'];
    const rows = rawRows
      .map((row, i) => {
        if (!errorRowSet.has(i)) return null;
        return [...csvHeaders.map(h => csvEscape(row[h] ?? '')), csvEscape(errorMap.get(i) ?? '')].join(',');
      })
      .filter(Boolean);

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import-errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  function csvEscape(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  const errorRowSet = new Set(validationErrors.map(e => e.row));

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <button
        onClick={() => router.push(`/tenant/${slug}/dashboard/products`)}
        style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.85rem', padding: 0, marginBottom: '1rem' }}
      >
        ← Back to products
      </button>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>Import Products from CSV</h1>

      {/* Step indicator */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', fontSize: '0.8rem' }}>
        {(['upload', 'preview', 'results'] as const).map((s, i) => (
          <span key={s} style={{
            color: step === s || (step === 'importing' && s === 'preview') ? '#3b82f6' : '#94a3b8',
            fontWeight: step === s ? 600 : 400,
          }}>
            {i + 1}. {s === 'upload' ? 'Upload' : s === 'preview' ? 'Preview & Map' : 'Results'}
          </span>
        ))}
      </div>

      {error && (
        <div style={{ background: '#fef2f2', color: '#dc2626', padding: '0.6rem 0.75rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div style={cardStyle}>
          <div
            onDragOver={e => e.preventDefault()}
            onDrop={handleFileDrop}
            style={{
              padding: '3rem 2rem', border: '2px dashed #d1d5db', borderRadius: '12px',
              textAlign: 'center', cursor: 'pointer', background: '#fafafa',
            }}
          >
            <p style={{ fontSize: '1rem', color: '#374151', marginBottom: '0.5rem', fontWeight: 500 }}>
              Drag & drop a CSV file here
            </p>
            <p style={{ color: '#94a3b8', fontSize: '0.85rem', marginBottom: '1rem' }}>or</p>
            <label style={{
              display: 'inline-block', padding: '0.5rem 1.25rem', background: '#3b82f6', color: '#fff',
              borderRadius: '8px', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
            }}>
              Browse Files
              <input type="file" accept=".csv,text/csv" hidden onChange={handleFileSelect} />
            </label>
          </div>

          <div style={{ marginTop: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button onClick={downloadTemplate} style={{
              background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.85rem', cursor: 'pointer', textDecoration: 'underline',
            }}>
              Download CSV template
            </button>
            <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Max 500 rows per import</span>
          </div>

          <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#f8fafc', borderRadius: '8px', fontSize: '0.8rem', color: '#64748b' }}>
            <strong>Expected columns:</strong> sku*, name*, price_cents*, description, category, stock_qty, low_stock_threshold, image_url, is_active
            <br /><span style={{ fontSize: '0.75rem' }}>* = required</span>
          </div>
        </div>
      )}

      {/* Step 2: Preview & Map */}
      {(step === 'preview' || step === 'importing') && (
        <>
          {/* Column Mapping */}
          <div style={{ ...cardStyle, marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 600, color: '#0f172a', marginTop: 0, marginBottom: '0.75rem' }}>
              Column Mapping
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
              {ALL_FIELDS.map(field => (
                <div key={field}>
                  <label style={{ fontSize: '0.75rem', fontWeight: 600, color: '#374151', display: 'block', marginBottom: '0.2rem' }}>
                    {field}{REQUIRED_FIELDS.includes(field as any) ? ' *' : ''}
                  </label>
                  <select
                    value={columnMap[field] ?? ''}
                    onChange={e => updateColumnMap(field, e.target.value)}
                    style={{ width: '100%', padding: '0.35rem', borderRadius: '6px', border: '1px solid #d1d5db', fontSize: '0.8rem' }}
                  >
                    <option value="">— unmapped —</option>
                    {csvHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Import mode */}
          <div style={{ ...cardStyle, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Import mode:</span>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="radio" name="mode" checked={mode === 'upsert'} onChange={() => setMode('upsert')} />
              Create & Update (upsert by SKU)
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input type="radio" name="mode" checked={mode === 'create'} onChange={() => setMode('create')} />
              Create only (error on duplicate SKU)
            </label>
          </div>

          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '8px', padding: '0.75rem', marginBottom: '1rem', fontSize: '0.8rem', color: '#92400e' }}>
              {validationErrors.length} validation warning{validationErrors.length > 1 ? 's' : ''}.
              {validationErrors.length <= 5 && validationErrors.map((e, i) => (
                <div key={i}>Row {e.row + 1}: {e.error}</div>
              ))}
              {validationErrors.length > 5 && ` Showing first 5: ${validationErrors.slice(0, 5).map(e => `Row ${e.row + 1}: ${e.error}`).join('; ')}`}
            </div>
          )}

          {/* Data preview */}
          <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: '1rem' }}>
            <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                Preview ({rawRows.length} rows)
              </span>
              <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Showing first 20 rows</span>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={thStyle}>#</th>
                    {ALL_FIELDS.filter(f => columnMap[f]).map(f => (
                      <th key={f} style={thStyle}>{f}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rawRows.slice(0, 20).map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: errorRowSet.has(i) ? '#fef2f2' : undefined }}>
                      <td style={tdStyle}>{i + 1}</td>
                      {ALL_FIELDS.filter(f => columnMap[f]).map(f => (
                        <td key={f} style={tdStyle}>{row[columnMap[f]] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={handleImport}
              disabled={step === 'importing' || validationErrors.length > 0}
              style={{
                padding: '0.6rem 1.5rem',
                background: step === 'importing' || validationErrors.length > 0 ? '#94a3b8' : '#0f172a',
                color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600,
                cursor: step === 'importing' || validationErrors.length > 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {step === 'importing' ? 'Importing...' : `Import ${rawRows.length} Products`}
            </button>
            <button
              onClick={() => { setStep('upload'); setRawRows([]); setCsvHeaders([]); setColumnMap({}); setValidationErrors([]); }}
              style={{ padding: '0.6rem 1.5rem', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer' }}
            >
              Start Over
            </button>
          </div>
        </>
      )}

      {/* Step 3: Results */}
      {step === 'results' && importResult && (
        <div style={cardStyle}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a', marginTop: 0, marginBottom: '1rem' }}>
            Import Complete
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ padding: '1rem', background: '#f0fdf4', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#16a34a' }}>{importResult.created}</div>
              <div style={{ fontSize: '0.8rem', color: '#166534' }}>Created</div>
            </div>
            <div style={{ padding: '1rem', background: '#eff6ff', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#3b82f6' }}>{importResult.updated}</div>
              <div style={{ fontSize: '0.8rem', color: '#1d4ed8' }}>Updated</div>
            </div>
            <div style={{ padding: '1rem', background: importResult.errors.length > 0 ? '#fef2f2' : '#f8fafc', borderRadius: '8px', textAlign: 'center' }}>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: importResult.errors.length > 0 ? '#dc2626' : '#94a3b8' }}>{importResult.errors.length}</div>
              <div style={{ fontSize: '0.8rem', color: importResult.errors.length > 0 ? '#991b1b' : '#94a3b8' }}>Errors</div>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div style={{ marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                <h4 style={{ fontSize: '0.85rem', fontWeight: 600, color: '#dc2626', margin: 0 }}>Error Details</h4>
                <button onClick={downloadErrorReport} style={{
                  background: 'none', border: 'none', color: '#3b82f6', fontSize: '0.8rem', cursor: 'pointer', textDecoration: 'underline',
                }}>
                  Download error report CSV
                </button>
              </div>
              <div style={{ maxHeight: '200px', overflow: 'auto', background: '#fef2f2', borderRadius: '8px', padding: '0.75rem', fontSize: '0.8rem', color: '#991b1b' }}>
                {importResult.errors.map((e, i) => (
                  <div key={i}>Row {e.row + 1}: {e.error}</div>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button
              onClick={() => router.push(`/tenant/${slug}/dashboard/products`)}
              style={{ padding: '0.6rem 1.5rem', background: '#0f172a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer' }}
            >
              View Products
            </button>
            <button
              onClick={() => { setStep('upload'); setRawRows([]); setCsvHeaders([]); setColumnMap({}); setValidationErrors([]); setImportResult(null); }}
              style={{ padding: '0.6rem 1.5rem', background: '#fff', color: '#374151', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', cursor: 'pointer' }}
            >
              Import More
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  background: '#fff', borderRadius: '12px', padding: '1.5rem',
  boxShadow: '0 1px 3px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0',
};

const thStyle: React.CSSProperties = {
  padding: '0.5rem 0.6rem', textAlign: 'left', fontSize: '0.7rem',
  fontWeight: 600, color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0',
};

const tdStyle: React.CSSProperties = {
  padding: '0.4rem 0.6rem', verticalAlign: 'middle',
};
