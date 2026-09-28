const common = {
  brand: { badge: 'Prively badge', name: 'Prively', tagline: 'Your digital Privê.', discreet: 'Less public, much more Privê.' },
  levels: { Bronze: 'Bronze', Prata: 'Silver', Ouro: 'Gold', VIP: 'VIP' },
  nav: { enter: 'Enter the Privê', creator: 'Become a creator', home: 'Home', designSystem: 'Design system' },
  hero: { title: 'Your digital Privê.', body: 'A private space for content, connection and control, built for adults.', privacyTitle: 'Privacy by design.', privacyBody: 'Social identity stays separate from legal data, notifications stay neutral, and the product is built around clear rules.', clientAction: 'Enter the Privê', creatorAction: 'Become a creator' },
  ageGate: { eyebrow: 'Before entering', title: 'Confirm you are 18 or older.', body: 'This is the first gate. Identity verification happens afterwards.', confirm: 'I am 18 or older', leave: 'Leave', policy: 'By continuing, you agree to review the Terms and Privacy Policy.' },
  auth: { signInTitle: 'Enter the Privê', signUpTitle: 'Create account', email: 'Email', password: 'Password', handle: 'Pseudonym', signIn: 'Sign in', signUp: 'Create account', noAccount: "Don't have an account yet?", haveAccount: 'Already have an account?', createNow: 'Create one', signInNow: 'Sign in now', back: 'Back', configError: 'Authentication is not configured in this environment.', invalidCredentials: 'The email or password is incorrect.', genericError: 'This action could not be completed. Try again.', checkEmail: 'Check your email to finish registration.', registered: 'Account created. Check your email to confirm your address.' },
  system: { sampleSans: 'Privê in control.', sampleSerif: 'Your Privê.', title: 'Prively Interface Kernel', intro: 'Living inventory of the design system. These components are the reusable base of the product.', foundations: 'Foundations', components: 'Components', states: 'States', typography: 'Typography', colors: 'Color', buttons: 'Buttons', levels: 'Levels', money: 'Money', cortina: 'Curtain', cordao: 'Cord', shield: 'Privacy shield', empty: 'Empty state', pin: 'PinPad' },
  common: { primary: 'Primary action', secondary: 'Secondary action', loading: 'Loading', error: 'Error', empty: 'Empty', success: 'Done', close: 'Close', language: 'Language' },
  privacy: { notice: 'Your conversations are private. They are protected in transit and at rest, and day to day only the people in the conversation can see them.', learnMore: 'Learn more' },
  curtain: { unlock: 'Unlock for {{price}}', protected: 'Protected by Curtain', unlocked: 'Content unlocked', pin: 'PIN', delete: 'Delete', confirm: 'OK' },
  errors: { ageRequired: 'You must confirm your age to continue.' },
  experience: {
    workspace: { client: 'Client Privê', creator: 'Creator studio' },
    nav: { discover: 'Discover', feed: 'Feed', wallet: 'Wallet', messages: 'Messages', account: 'Me', studio: 'Studio', content: 'Content', create: 'Create', settings: 'Settings' },
    session: { connected: 'Connection available', unconfigured: 'Supabase not configured', active: 'Active session', account: 'Authenticated account', preview: 'No session', devOnly: 'development preview' },
    pages: {
      emptyAction: 'Real data for this area will be connected through the backend for its feature.',
      discover: { title: 'Discover', intro: 'Explore creators', detail: 'Discovery will be powered by real profiles, approximate location, filters and availability. No invented results are shown in this phase.' },
      feed: { title: 'Feed', intro: 'Content', detail: 'The vertical feed will connect to the real catalogue and server visibility rules. No fictional content is displayed.' },
      profile: { title: 'Profile', intro: 'Channel', detail: 'Profiles will load by handle from the backend. Content authorization remains a server decision.' },
      post: { title: 'Post', intro: 'Content', detail: 'Posts will load by real identifier and media will only be shown when the corresponding authorization exists.' },
      messages: { title: 'Messages', intro: 'Private conversations', detail: 'The inbox will connect to Realtime and backend rules for blocks, visibility and paid messages.' },
      message: { title: 'Conversation', intro: 'Private messages', detail: 'A conversation will only load when an authorized membership relation exists.' },
      wallet: { title: 'Wallet', intro: 'Internal balance', balanceUnavailable: 'Balance not connected yet', notice: 'Financial movements will always be calculated server-side and recorded in the ledger.', empty: 'No financial movements to show', detail: 'The wallet remains without data until the real financial source is connected.' },
      purchases: { title: 'Purchases', intro: 'History', detail: 'History will be derived from the user’s real transactions. No demo purchases are created.' },
      wishlist: { title: 'Wishlist', intro: 'Save for later', detail: 'Items will be persisted in the database and loaded only for the authenticated user.' },
      account: { title: 'Account', intro: 'Account identity', detail: 'This area handles non-sensitive account data. Social identity remains separate from legal identity.' },
      privacy: { title: 'Privacy', intro: 'Control and discretion', detail: 'Privacy rules will be persisted and enforced server-side when the corresponding backend is active.' },
      limits: { title: 'Spend limits', intro: 'Financial control', detail: 'Limits will take effect server-side through spend rules. The interface cannot replace that authority.' },
      discreet: { title: 'Discreet mode', intro: 'Device protection', detail: 'The surface is defined here; secure persistence and complete behaviour will be connected with the privacy backend.' },
      creator: {
        studio: { title: 'Studio', intro: 'Creator operations', detail: 'The studio will be powered by real earnings, content, fans and activity, without invented metrics.' },
        content: { title: 'Content', intro: 'Publishing and catalogue', detail: 'This area will connect to the upload, consent, moderation and publishing pipeline.' },
        store: { title: 'Store', intro: 'Products and packs', detail: 'Products, packs and orders will come from the database and use real financial rules.' },
        agenda: { title: 'Schedule', intro: 'Social availability', detail: 'Scheduling will use real availability windows and approved public venues.' },
        fans: { title: 'Fans', intro: 'Relationships and management', detail: 'Fan management will derive from real relationships and use pseudonyms where applicable.' },
        earnings: { title: 'Earnings', intro: 'Creator finance', detail: 'Pending and available earnings only appear from the ledger and actual release rules.' },
        analytics: { title: 'Analytics', intro: 'Results', detail: 'This area will only show charts when real aggregates exist.' },
        requests: { title: 'Requests', intro: 'Custom requests', detail: 'Requests and escrow will connect to the financial engine once that layer is implemented.' },
        auctions: { title: 'Auctions', intro: 'Auction content', detail: 'Auctions depend on server-side concurrency controls and escrow.' },
        lives: { title: 'Live and calls', intro: 'Live', detail: 'Rooms and per-minute billing will only be created through the backend and the real provider.' },
        settings: { title: 'Studio settings', intro: 'Configuration', detail: 'Settings will connect to persisted data and real creator permissions.' }
      },
      seCreator: { title: 'Become a creator', intro: 'Creator entry', detail: 'Entry starts with registration and continues through identity verification before publishing.', action: 'Create account' },
      about: { title: 'About Prively', intro: 'The platform', detail: 'Product and institutional information for Prively.' },
      help: { title: 'Help', intro: 'Help centre', detail: 'Guidance for account, privacy, safety and platform use.' },
      legal: {
        termos: { title: 'Terms', intro: 'Legal document', detail: 'The published terms must be linked to the approved legal content before launch.' },
        privacidade: { title: 'Privacy', intro: 'Legal document', detail: 'The published policy must reflect the data actually processed by the platform.' },
        'conteudo-proibido': { title: 'Prohibited content', intro: 'Legal document', detail: 'Published rules must match the moderation mechanisms actually active.' },
        reembolsos: { title: 'Refunds', intro: 'Legal document', detail: 'The policy must match the real payment, dispute and refund rules.' },
        cookies: { title: 'Cookies', intro: 'Legal document', detail: 'The policy must match the real storage and analytics mechanisms.' },
        dmca: { title: 'Content removal', intro: 'Legal document', detail: 'The removal process will connect to the real compliance and moderation queue.' }
      },
      info: { note: 'Legal and institutional content should only be published after approval and versioning.' }
    }
  }
} as const;

export default common;