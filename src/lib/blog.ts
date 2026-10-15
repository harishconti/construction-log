/**
 * Blog content. Kept as structured data (not MDX) so there is no build-time dependency and every
 * post renders through one accessible component. Add a post by appending to `POSTS`.
 */

export type BlogBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'steps'; items: { title: string; text: string }[] }
  | { type: 'callout'; tone: 'info' | 'tip' | 'warn'; text: string }
  | { type: 'links'; items: { label: string; href: string; text: string }[] };

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  /** ISO date (`YYYY-MM-DD`). */
  date: string;
  readingMinutes: number;
  tags: string[];
  body: BlogBlock[];
};

export const POSTS: BlogPost[] = [
  {
    slug: 'getting-started',
    title: 'Getting started with Construction Ledger',
    description:
      'Create an account, set up your first project and record your first site expense in a few minutes.',
    date: '2026-10-15',
    readingMinutes: 4,
    tags: ['Basics'],
    body: [
      {
        type: 'p',
        text: 'Construction Ledger keeps a home-construction project’s money and site history in one place: expenses with their bills, a dated diary, budgets per category, and a small team with roles. This guide walks through the first fifteen minutes.',
      },
      { type: 'h2', text: '1. Create your account' },
      {
        type: 'steps',
        items: [
          {
            title: 'Sign up',
            text: 'Use an email and password, Google, or a one-time email link. Your password never reaches our servers — sign-in is handled by the identity provider.',
          },
          {
            title: 'Give your consent',
            text: 'Under India’s DPDP Act you are shown each purpose your data is used for and choose the optional ones. You can change your mind any time from Account settings.',
          },
        ],
      },
      { type: 'h2', text: '2. Create your first project' },
      {
        type: 'p',
        text: 'A project is one build — “My House”, “Anna Nagar flat renovation”, and so on. It holds its own expenses, diary and budgets, and its own members.',
      },
      {
        type: 'ol',
        items: [
          'From Your projects, tap New project.',
          'Give it a name and a start date, and optionally add the site location or a geotag.',
          'Tap Create. You become the project’s first admin, and a set of default categories is created for you.',
        ],
      },
      { type: 'h2', text: '3. Record an expense' },
      {
        type: 'p',
        text: 'Open Expenses and tap Add expense. Enter the amount, which category it belongs to, how it was paid, and — if the bill has tax in it — the GST part. Attach the bill photo while you are there, so it is never lost.',
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Log expenses the same day. A receipt in your pocket is easy; a receipt from three weeks ago rarely is.',
      },
      { type: 'h2', text: '4. Invite the people on site' },
      {
        type: 'p',
        text: 'Admins can invite family or the site engineer by email from Members. Invitees get admin, editor or viewer access — editors can add and fix expenses, viewers can only look.',
      },
      { type: 'h2', text: 'Where to go next' },
      {
        type: 'links',
        items: [
          { label: 'Track expenses and bills', href: '/blog/track-expenses', text: 'GST, vendors, filters and undo' },
          { label: 'Set budgets that work', href: '/blog/budgets-that-work', text: 'Planned vs actual by week or month' },
          { label: 'Keep a site diary', href: '/blog/site-diary', text: 'Dated notes and photos' },
        ],
      },
    ],
  },
  {
    slug: 'track-expenses',
    title: 'Tracking expenses, GST and bills',
    description:
      'How to record expenses correctly, attach bills, search vendors, and undo a mistake safely.',
    date: '2026-10-15',
    readingMinutes: 4,
    tags: ['Expenses'],
    body: [
      {
        type: 'p',
        text: 'Expenses are the heart of the ledger. Each one records what was spent, when, on what, and how it was paid — and can carry the bill or a photo as proof.',
      },
      { type: 'h2', text: 'What each expense holds' },
      {
        type: 'ul',
        items: [
          'Amount — the GST-inclusive total you actually paid.',
          'GST amount — the tax already included in that total, if the bill shows it.',
          'Category — cement, labour, tax, utility or whatever you have set up.',
          'Vendor — the shop, supplier or contractor.',
          'Payment mode — cash, UPI, bank, card or credit.',
          'Description and photos of the bill.',
        ],
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'GST is part of the amount, not added on top. If a bill reads ₹1,000 + ₹180 GST and you paid ₹1,180, enter 1,180 as the amount and 180 as GST.',
      },
      { type: 'h2', text: 'Attaching bills' },
      {
        type: 'p',
        text: 'Attach up to ten files per expense, up to 10 MB each. JPEG, PNG, WebP and GIF images show as thumbnails you can tap to enlarge; PDFs and spreadsheets are kept as downloads. Files live in private storage and are served only to signed-in members of the project.',
      },
      { type: 'h2', text: 'Finding things again' },
      {
        type: 'p',
        text: 'The Expenses screen groups entries by day with a daily total, and lets you filter by category, payment mode and date, and search by vendor. On wider screens it becomes a table with a running total.',
      },
      { type: 'h2', text: 'Fixing a mistake' },
      {
        type: 'p',
        text: 'Opening an expense lets an editor change any field. Deleting is a soft delete: the row is hidden from lists and totals but not destroyed. Admins get an “Undo” toast right away, and can restore an older deletion later — nothing vanishes by accident.',
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'Two people editing the same expense at once is prevented: if someone saved first, you are asked to reload rather than silently overwrite their change.',
      },
    ],
  },
  {
    slug: 'budgets-that-work',
    title: 'Setting budgets that match your build',
    description:
      'Plan spend by category for a week or a month, see how actual spend compares, and revise as you go.',
    date: '2026-10-15',
    readingMinutes: 4,
    tags: ['Budgets'],
    body: [
      {
        type: 'p',
        text: 'A budget is a planned amount for one category over one period — a week or a month. The app compares it against the actual expenses recorded in that period, so you can see where the build is heading while there is still time to react.',
      },
      { type: 'h2', text: 'How it is calculated' },
      {
        type: 'p',
        text: 'Actual spend is never typed in — it is always the sum of the expenses in that category and period. That means it can never drift out of sync with the ledger, and deleting a wrongly-entered expense corrects the budget automatically.',
      },
      { type: 'h2', text: 'Reading the colours' },
      {
        type: 'ul',
        items: [
          'Green — under 80% of the plan used.',
          'Yellow — between 80% and 100%; watch the pace.',
          'Red — over the plan.',
        ],
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'Start with the few categories where money really moves — cement, steel, labour — rather than planning every category precisely. You can add the rest later.',
      },
      { type: 'h2', text: 'Revising a budget' },
      {
        type: 'p',
        text: 'To change a planned amount, open the budget and revise it with a short reason. Every change is kept as an append-only history, so you can always see what the plan was before and why it changed.',
      },
      { type: 'h2', text: 'Weeks or months' },
      {
        type: 'p',
        text: 'Use monthly budgets for the big picture and weekly budgets when a phase is moving fast. Weeks run Monday to Sunday on the Asia/Kolkata calendar.',
      },
    ],
  },
  {
    slug: 'site-diary',
    title: 'Keeping a site diary',
    description: 'Dated notes, decisions and photos — the story of the build beside the numbers.',
    date: '2026-10-15',
    readingMinutes: 3,
    tags: ['Diary'],
    body: [
      {
        type: 'p',
        text: 'The diary is where the non-financial history lives: what was poured, what the engineer said, which tiles were delivered, why a wall moved. It sits beside the ledger so future-you can connect a cost to the day it happened.',
      },
      { type: 'h2', text: 'Writing an entry' },
      {
        type: 'ul',
        items: [
          'Pick the date the work happened, not the day you typed it.',
          'Give it a short title so it is easy to scan later.',
          'Write the detail in the body, and attach up to ten photos.',
        ],
      },
      { type: 'h2', text: 'Editing rules' },
      {
        type: 'p',
        text: 'The person who wrote an entry, or a project admin, can edit or delete it — so mistakes are fixable without letting anyone quietly rewrite someone else’s record.',
      },
      {
        type: 'callout',
        tone: 'tip',
        text: 'A photo of the day’s work, taken from the same spot each week, becomes a surprisingly clear progress record at handover time.',
      },
    ],
  },
  {
    slug: 'team-and-roles',
    title: 'Inviting your team and choosing roles',
    description: 'Admins, editors and viewers — who can do what, and how to bring people in safely.',
    date: '2026-10-15',
    readingMinutes: 3,
    tags: ['Team'],
    body: [
      {
        type: 'p',
        text: 'A project can have several members, each with a role. Roles only apply within one project, so the same person can be an admin on one build and a viewer on another.',
      },
      { type: 'h2', text: 'The three roles' },
      {
        type: 'ul',
        items: [
          'Admin — everything an editor can do, plus member management, project settings, categories, and deleting or restoring expenses.',
          'Editor — add and fix expenses, diary entries and budgets.',
          'Viewer — see the project, but change nothing.',
        ],
      },
      { type: 'h2', text: 'Two ways to invite people' },
      {
        type: 'ol',
        items: [
          'By email — enter the address and role. If they do not have an account yet, the invitation waits and applies the moment they sign up.',
          'By link — create a single-use join link for a chosen role and share it however you like. It expires after seven days and can be revoked before it is used.',
        ],
      },
      {
        type: 'callout',
        tone: 'warn',
        text: 'Treat a join link like a key: anyone who opens it joins with that role. Share it only with the intended person, and revoke it if it goes astray.',
      },
      { type: 'h2', text: 'The last admin is protected' },
      {
        type: 'p',
        text: 'The only admin of a project cannot be removed or demoted, so a shared project can never be left without someone able to manage it.',
      },
    ],
  },
  {
    slug: 'use-cases',
    title: 'What people use Construction Ledger for',
    description: 'From a single house build to a family renovation — common ways the ledger is used.',
    date: '2026-10-15',
    readingMinutes: 4,
    tags: ['Use cases'],
    body: [
      {
        type: 'p',
        text: 'The app was built for a home-construction project run with family and a contractor, but the same shape — expenses, a diary, budgets, roles — fits several nearby jobs.',
      },
      { type: 'h2', text: 'A self-built house' },
      {
        type: 'p',
        text: 'Track every material bill, labour payment and utility charge against a monthly plan, and keep the bills attached to the expense that describes them. At the end you have a complete, searchable record of what the house cost.',
      },
      { type: 'h2', text: 'A renovation or extension' },
      {
        type: 'p',
        text: 'Renovations have many small, fast decisions. Weekly budgets by category keep a lid on the running spend, and the diary captures what changed and when — useful if something needs revisiting.',
      },
      { type: 'h2', text: 'Family and contractor collaboration' },
      {
        type: 'p',
        text: 'Give the family admin access and the site engineer an editor role for expenses and the diary. Everyone sees the same numbers instead of three different spreadsheets on three phones.',
      },
      { type: 'h2', text: 'Keeping an eye on advances' },
      {
        type: 'p',
        text: 'Payments to a contractor can be recorded as they are made, with the bill or signed slip attached, so the running total of what has been paid is always to hand.',
      },
      { type: 'h2', text: 'Several sites at once' },
      {
        type: 'p',
        text: 'One account can hold many projects. Each keeps its own members, categories, budgets and history, and you switch between them from the project switcher.',
      },
      {
        type: 'links',
        items: [
          { label: 'Create your first project', href: '/projects', text: 'Sign in and get started' },
          { label: 'Your data and privacy', href: '/blog/your-data', text: 'What is stored and how to delete it' },
        ],
      },
    ],
  },
  {
    slug: 'your-data',
    title: 'Your data, consent and how to delete it',
    description: 'What the app stores, how consent works under the DPDP Act, and how account deletion runs.',
    date: '2026-10-15',
    readingMinutes: 4,
    tags: ['Privacy'],
    body: [
      {
        type: 'p',
        text: 'Construction Ledger holds personal data — your name and email, the expenses and notes you enter, and the bills you upload. This is a short, practical version of how that is handled; the Privacy Policy is the authoritative one.',
      },
      { type: 'h2', text: 'Consent, itemised' },
      {
        type: 'p',
        text: 'On your first visit you are shown each purpose your data is used for and choose the optional ones. Consent is recorded against the version of the notice you accepted, and you are asked again if the notice changes.',
      },
      { type: 'h2', text: 'What is stored, and where' },
      {
        type: 'ul',
        items: [
          'Account details and a mirror row used for the ledger’s record-keeping.',
          'Your expenses, diary entries and budgets in the project database.',
          'Uploaded photos and documents in private storage, reachable only through signed links.',
        ],
      },
      { type: 'h2', text: 'Deleting your account' },
      {
        type: 'p',
        text: 'From Account settings you can request deletion. It is scheduled thirty days ahead so a change of mind is possible, and can be cancelled any time in that window. When it runs, your name and email are erased, the projects you solely owned — with their expenses, diary, budgets and files — are permanently deleted, and projects shared with other members stay with them.',
      },
      {
        type: 'callout',
        tone: 'info',
        text: 'Deleting your account also withdraws your consent, because the ledger cannot run without it.',
      },
      { type: 'h2', text: 'Keep your own copies' },
      {
        type: 'p',
        text: 'A ledger is a record, not a backup. Photographs and documents matter enough that you should keep an independent copy of anything you cannot afford to lose.',
      },
      {
        type: 'links',
        items: [
          { label: 'Read the Privacy Policy', href: '/privacy', text: 'Full detail, your rights and our contact' },
          { label: 'Read the Terms of Service', href: '/terms', text: 'The rules for using the app' },
        ],
      },
    ],
  },
];

/** Newest first. */
export function allPosts(): BlogPost[] {
  return [...POSTS].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
