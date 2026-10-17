import {
  Coins,
  Gift,
  Handshake,
  Landmark,
  PiggyBank,
  TrendingUp,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

// One glyph per funding *source* (see FUNDING_SOURCES in src/lib/funding.ts).
const ICONS: Record<string, LucideIcon> = {
  bank: Landmark,
  client: Handshake,
  customer: UserRound,
  peer_lending: Users,
  self: PiggyBank,
  grant: Gift,
  investor: TrendingUp,
  other: Coins,
};

export function FundingIcon({ source, size = 18 }: { source?: string; size?: number }) {
  const Icon = (source && ICONS[source]) || Coins;
  return <Icon size={size} aria-hidden />;
}
