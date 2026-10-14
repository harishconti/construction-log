import { TransactionsView } from '@/components/TransactionsView';

export const dynamic = 'force-dynamic';

export default async function TransactionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TransactionsView projectId={id} />;
}
