import { TimelineView } from '@/components/TimelineView';

export const dynamic = 'force-dynamic';

export default async function TimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TimelineView projectId={id} />;
}
