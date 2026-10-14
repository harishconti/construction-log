import { DiaryView } from '@/components/DiaryView';

export const dynamic = 'force-dynamic';

export default async function DiaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <DiaryView projectId={id} />;
}
