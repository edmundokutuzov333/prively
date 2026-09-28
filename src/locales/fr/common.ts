const common = {
  brand: { badge: 'Sceau Prively', name: 'Prively', tagline: 'Ton Privê digital.', discreet: 'Moins public, beaucoup plus Privê.' },
  levels: { Bronze: 'Bronze', Prata: 'Argent', Ouro: 'Or', VIP: 'VIP' },
  nav: { enter: 'Entrer dans le Privê', creator: 'Devenir créatrice', home: 'Accueil', designSystem: 'Système de design' },
  hero: { title: 'Ton Privê digital.', body: 'Un espace privé pour le contenu, le lien et le contrôle, conçu pour les adultes.', privacyTitle: 'La discrétion par conception.', privacyBody: 'L’identité sociale reste séparée des données légales, les notifications restent neutres et le produit repose sur des règles claires.', clientAction: 'Entrer dans le Privê', creatorAction: 'Devenir créatrice' },
  ageGate: { eyebrow: 'Avant d’entrer', title: 'Confirme que tu as 18 ans ou plus.', body: 'C’est le premier portail. La vérification d’identité vient ensuite.', confirm: 'J’ai 18 ans ou plus', leave: 'Quitter', policy: 'En continuant, tu acceptes de consulter les Conditions et la Politique de confidentialité.' },
  auth: { signInTitle: 'Entrer dans le Privê', signUpTitle: 'Créer un compte', creatorSignInTitle: 'Connexion créatrice', creatorSignUpTitle: 'Créer un compte créatrice', adminTitle: 'Administration Prively', adminEyebrow: 'Zone restreinte', email: 'Email', password: 'Mot de passe', handle: 'Pseudonyme', signIn: 'Entrer', signUp: 'Créer un compte', noAccount: 'Tu n’as pas encore de compte ?', haveAccount: 'Tu as déjà un compte ?', createNow: 'Créer maintenant', signInNow: 'Entrer maintenant', back: 'Retour', invalidCredentials: 'L’email ou le mot de passe est incorrect.', invalidHandle: 'Choisis un pseudonyme valide.', genericError: 'Cette action n’a pas pu être terminée. Réessaie.', adminRequired: 'Ce compte ne possède pas les permissions administrateur.', adminUsePortal: 'Les comptes administrateur doivent se connecter via /admin.', creatorRequired: 'Ce compte n’est pas configuré comme créatrice.', creatorUsePortal: 'Les comptes créatrice doivent se connecter via la zone créatrice.', registrationNoSession: 'Le compte a été créé, mais la session n’a pas pu démarrer.', clientRegistered: 'Compte client créé.', creatorRegistered: 'Compte créatrice créé.' },
  admin: { description: 'Centre de contrôle Prively. Les accès sont vérifiés côté serveur.', open: 'Ouvrir la zone' },
  system: { sampleSans: 'Privê en contrôle.', sampleSerif: 'Ton Privê.', title: 'Prively Interface Kernel', intro: 'Inventaire vivant du système de design. Ces composants sont la base réutilisable du produit.', foundations: 'Fondations', components: 'Composants', states: 'États', typography: 'Typographie', colors: 'Couleur', buttons: 'Boutons', levels: 'Niveaux', money: 'Argent', cortina: 'Rideau', cordao: 'Cordon', shield: 'Bouclier de confidentialité', empty: 'État vide', pin: 'PinPad' },
  common: { primary: 'Action principale', secondary: 'Action secondaire', loading: 'Chargement', error: 'Erreur', empty: 'Vide', success: 'Terminé', close: 'Fermer', language: 'Langue' },
  privacy: { notice: 'Tes conversations sont privées. Elles sont protégées en transit et au repos, et au quotidien seules les personnes de la conversation peuvent les voir.', learnMore: 'En savoir plus' },
  curtain: { unlock: 'Déverrouiller pour {{price}}', protected: 'Protégé par le Rideau', unlocked: 'Contenu déverrouillé', pin: 'PIN', delete: 'Supprimer', confirm: 'OK' },
  errors: { ageRequired: 'Tu dois confirmer ton âge pour continuer.' },
  experience: {
    workspace: { client: 'Privê client', creator: 'Studio créatrice' },
    nav: { discover: 'Découvrir', feed: 'Fil', wallet: 'Portefeuille', messages: 'Messages', account: 'Moi', studio: 'Studio', content: 'Contenu', create: 'Créer', settings: 'Réglages' },
    session: { connected: 'Connexion disponible', unconfigured: 'Supabase non configuré', active: 'Session active', account: 'Compte authentifié', preview: 'Sans session', devOnly: 'prévisualisation de développement' },
    pages: {
      emptyAction: 'Les données réelles de cet espace seront reliées au backend de sa fonctionnalité.',
      discover: { title: 'Découvrir', intro: 'Explorer les créatrices', detail: 'La découverte sera alimentée par des profils, une localisation approximative, des filtres et des disponibilités réels. Aucun résultat inventé n’est affiché dans cette phase.' },
      feed: { title: 'Fil', intro: 'Contenu', detail: 'Le fil vertical sera relié au catalogue réel et aux règles de visibilité du serveur. Aucun contenu fictif n’est affiché.' },
      profile: { title: 'Profil', intro: 'Canal', detail: 'Les profils seront chargés par handle depuis le backend. L’autorisation du contenu restera une décision du serveur.' },
      post: { title: 'Publication', intro: 'Contenu', detail: 'Les publications seront chargées par identifiant réel et le média ne sera montré que si l’autorisation correspondante existe.' },
      messages: { title: 'Messages', intro: 'Conversations privées', detail: 'La boîte de réception sera reliée au Realtime et aux règles backend de blocage, visibilité et messages payants.' },
      message: { title: 'Conversation', intro: 'Messages privés', detail: 'Une conversation ne sera chargée que lorsqu’une relation de membres autorisée existe.' },
      wallet: { title: 'Portefeuille', intro: 'Solde interne', balanceUnavailable: 'Solde non connecté', notice: 'Les mouvements financiers seront toujours calculés côté serveur et inscrits au ledger.', empty: 'Aucun mouvement financier à afficher', detail: 'Le portefeuille reste sans données jusqu’à la connexion de la source financière réelle.' },
      purchases: { title: 'Achats', intro: 'Historique', detail: 'L’historique proviendra des transactions réelles de l’utilisateur. Aucun achat de démonstration n’est créé.' },
      wishlist: { title: 'Liste de souhaits', intro: 'Garder pour plus tard', detail: 'Les éléments seront persistés en base et chargés uniquement pour l’utilisateur authentifié.' },
      account: { title: 'Compte', intro: 'Identité du compte', detail: 'Cette zone gère les données de compte non sensibles. L’identité sociale reste séparée de l’identité légale.' },
      privacy: { title: 'Confidentialité', intro: 'Contrôle et discrétion', detail: 'Les règles de confidentialité seront persistées et imposées côté serveur lorsque le backend correspondant sera actif.' },
      limits: { title: 'Limites de dépense', intro: 'Contrôle financier', detail: 'Les limites prendront effet côté serveur. L’interface ne peut pas remplacer cette autorité.' },
      discreet: { title: 'Mode discret', intro: 'Protection de l’appareil', detail: 'La surface est définie ici ; la persistance sécurisée et le comportement complet seront reliés au backend de confidentialité.' },
      creator: {
        studio: { title: 'Studio', intro: 'Opérations créatrice', detail: 'Le studio sera alimenté par des gains, contenus, fans et activités réels, sans métriques inventées.' },
        content: { title: 'Contenu', intro: 'Publication et catalogue', detail: 'Cette zone sera reliée au pipeline d’upload, de consentement, de modération et de publication.' },
        store: { title: 'Boutique', intro: 'Produits et packs', detail: 'Les produits, packs et commandes proviendront de la base et utiliseront les règles financières réelles.' },
        agenda: { title: 'Agenda', intro: 'Disponibilité sociale', detail: 'L’agenda utilisera des créneaux réels et des lieux publics approuvés.' },
        fans: { title: 'Fans', intro: 'Relations et gestion', detail: 'La gestion des fans dérivera de relations réelles et utilisera des pseudonymes lorsque nécessaire.' },
        earnings: { title: 'Gains', intro: 'Finance créatrice', detail: 'Les gains en attente et disponibles proviendront uniquement du ledger et des règles de libération réelles.' },
        analytics: { title: 'Analytique', intro: 'Résultats', detail: 'Les graphiques n’apparaîtront que lorsque de vrais agrégats existeront.' },
        requests: { title: 'Demandes', intro: 'Demandes personnalisées', detail: 'Les demandes et l’escrow seront reliés au moteur financier lors de son implémentation.' },
        auctions: { title: 'Enchères', intro: 'Contenu aux enchères', detail: 'Les enchères dépendront des contrôles de concurrence et de l’escrow côté serveur.' },
        lives: { title: 'Lives et appels', intro: 'Direct', detail: 'Les salles et la facturation à la minute seront créées uniquement via le backend et le fournisseur réel.' },
        settings: { title: 'Réglages du studio', intro: 'Configuration', detail: 'Les réglages seront reliés aux données persistées et aux permissions réelles de la créatrice.' }
      },
      seCreator: { title: 'Devenir créatrice', intro: 'Entrée créatrice', detail: 'Le parcours commence par l’inscription et passe par la vérification d’identité avant la publication.', action: 'Créer un compte' },
      about: { title: 'À propos de Prively', intro: 'La plateforme', detail: 'Informations produit et institutionnelles de Prively.' },
      help: { title: 'Aide', intro: 'Centre d’aide', detail: 'Conseils pour le compte, la confidentialité, la sécurité et l’utilisation de la plateforme.' },
      legal: {
        termos: { title: 'Conditions', intro: 'Document légal', detail: 'Les conditions publiées devront être reliées au contenu juridique approuvé avant le lancement.' },
        privacidade: { title: 'Confidentialité', intro: 'Document légal', detail: 'La politique publiée devra refléter les données réellement traitées.' },
        'conteudo-proibido': { title: 'Contenu interdit', intro: 'Document légal', detail: 'Les règles publiées devront correspondre aux mécanismes de modération actifs.' },
        reembolsos: { title: 'Remboursements', intro: 'Document légal', detail: 'La politique devra correspondre aux règles réelles de paiement, litige et remboursement.' },
        cookies: { title: 'Cookies', intro: 'Document légal', detail: 'La politique devra correspondre aux mécanismes réels de stockage et d’analyse.' },
        dmca: { title: 'Retrait de contenu', intro: 'Document légal', detail: 'Le processus sera relié à la file réelle de conformité et de modération.' }
      },
      info: { note: 'Les contenus légaux et institutionnels ne doivent être publiés qu’après validation et versionnage.' }
    }
  },
  surface: {
    title: 'Zone Prively',
    intro: 'Cette surface est déjà structurée dans le code et suit le système visuel, le routage et le modèle d’états de la plateforme.',
    backendGated: 'La capacité opérationnelle correspondante n’est exposée en production que lorsque le backend réel, les permissions et les intégrations sont actifs.',
    route: 'Route',
    stateTitle: 'État opérationnel',
    stateIntro: 'Surface préparée pour les états extrêmes, les échecs et le contrôle d’accès.',
    stateDetail: 'L’état est représenté comme une vraie surface de l’application, sans données simulées.',
    state: 'État',
    stateBackend: 'Cet état doit être connecté au flux réel qui l’a produit avant d’être exposé en production.'
  },
  phase3Advanced: {support:{eyebrow:"Soutien",title:"Soutenir la créatrice",intro:"Abonnements, pourboires et cadeaux facturés via le serveur.",missingChannel:"Canal manquant",missingChannelBody:"Ouvre cette zone depuis un canal réel.",tipTitle:"Pourboire",amount:"Montant en MZN",message:"Message optionnel",sendTip:"Envoyer",giftsTitle:"Cadeaux",sendGift:"Envoyer",noGifts:"Aucun cadeau configuré",noGiftsBody:"Le catalogue des cadeaux n’est pas encore configuré.",subscriptionsTitle:"Abonnements",months:"{{count}} mois",noTiers:"Aucun niveau",noTiersBody:"Ce canal n’a pas encore de niveaux d’abonnement configurés."},bundles:{eyebrow:"Packs",clientTitle:"Packs de contenu",clientIntro:"Packs persistés achetés via le ledger.",buy:"Acheter le pack",emptyTitle:"Aucun pack",emptyBody:"Aucun pack réel pour le moment.",creatorTitle:"Packs de la créatrice",creatorIntro:"Regroupe des publications réelles dans un pack à prix unique.",name:"Nom du pack",price:"Prix en MZN",description:"Description",create:"Créer le pack"},engagement:{eyebrow:"Interaction",creatorTitle:"Tirages et sondages",creatorIntro:"Crée des interactions réelles pour la communauté.",clientTitle:"Participation",clientIntro:"Vote et participe aux interactions ouvertes.",pollTitle:"Nouveau sondage",question:"Question",optionsHint:"Une option par ligne",createPoll:"Créer le sondage",giveawayTitle:"Nouveau tirage",title:"Titre",winnerCountLabel:"Nombre de gagnants",createGiveaway:"Créer le tirage",winnerCount:"{{count}} gagnant(s)",enter:"Participer",emptyTitle:"Aucune activité",emptyBody:"Aucun sondage ou tirage actif."},schedule:{eyebrow:"Agenda",title:"Disponibilités",intro:"Définis de vraies plages de disponibilité.",area:"Zone publique facultative",create:"Créer le créneau"},rankings:{eyebrow:"Classements",title:"Classements hebdomadaires",intro:"Classements calculés par le backend.",creators:"Créatrices",fans:"Fans"}}
} as const;

export default common;