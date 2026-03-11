import type { Metadata } from 'next';
import { WorkspaceChat } from '@/components/WorkspaceChat';

export const metadata: Metadata = { title: 'Team Workspace' };

interface PageProps {
  params: { slug: string };
}

export default function WorkspacePage({ params }: PageProps) {
  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 h-[calc(100vh-8rem)]">
      <WorkspaceChat slug={params.slug} />
    </div>
  );
}
