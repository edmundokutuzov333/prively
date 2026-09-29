import { FileText, Lifebuoy, Question, ShieldCheck } from '@phosphor-icons/react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Ficha } from '@/design/Ficha';
import { PageFrame } from '@/pages/PageFrame';

type LegalSection = {
  title: string;
  paragraphs: string[];
};

type LegalDoc = {
  title: string;
  intro: string;
  sections: LegalSection[];
};

const legalByLanguage: Record<string, Record<string, LegalDoc>> = {
  'pt-MZ': {
    termos: {
      title: 'Termos para clientes e criadoras',
      intro: 'Resumo operacional baseado no Documento Oficial da Prively. A versão jurídica final depende de revisão e aprovação em Moçambique antes do lançamento público.',
      sections: [
        { title: 'Quem pode usar', paragraphs: ['A Prively é exclusiva para adultos. Todos os clientes e criadoras passam por verificação de idade e identidade. Sem verificação concluída não há acesso a conteúdo adulto, gastos ou levantamentos.'] },
        { title: 'Conta e pseudónimo', paragraphs: ['O cliente pode usar pseudónimo e avatar sem expor o nome real às criadoras. A identidade legal é mantida para fins de verificação e conformidade.'] },
        { title: 'Conteúdo e consentimento', paragraphs: ['Quem publica declara que todas as pessoas que aparecem são adultas e consentiram com a gravação e publicação. Conteúdo sem consentimento, vingança íntima e gravações escondidas são proibidos.'] },
        { title: 'Conteúdo proibido', paragraphs: ['São proibidos menores, violência sexual, tortura, mutilação, bestialidade, tráfico, exploração, coerção, violações de direitos de autor ou privacidade, promoção de serviços sexuais pagos e fraude.'] },
        { title: 'Encontros sociais', paragraphs: ['A agenda social é gratuita. A Prively não cobra por encontros, não fixa preços de actos sexuais, não mantém catálogo de serviços sexuais, não sugere hotéis e não garante segurança, comparência, pagamento ou condições do encontro.'] },
        { title: 'Conteúdo pago', paragraphs: ['Assinaturas, PPV, mensagens pagas, lives, chamadas, gorjetas, presentes, pedidos personalizados, leilões, bundles e produtos são processados através dos mecanismos da plataforma. Para criadoras, os Termos de Condições v1.0.0 definem 20 por cento sobre assinaturas, PPV, mensagens pagas e lives, 10 por cento sobre gorjetas e 0 por cento sobre encontros presenciais.'] },
        { title: 'Dinheiro e levantamentos', paragraphs: ['A carteira é denominada em meticais e os movimentos são registados no ledger. A especificação prevê recargas por dinheiro móvel e cartões compatíveis, retenção de ganhos por um período de segurança, escrow em operações aplicáveis e levantamento mínimo de 500 MT.'] },
        { title: 'Privacidade e acesso da equipa', paragraphs: ['A equipa não lê conversas por rotina. O acesso a conteúdo denunciado, sinalizado ou solicitado por autoridade exige justificação e registo. Mensagens privadas exigem aprovação de segunda pessoa para o acesso da equipa.'] },
        { title: 'Lei aplicável', paragraphs: ['Os Termos para Criadoras v1.0.0 preveem a lei moçambicana e o foro da cidade de Maputo. O documento continua sujeito a revisão jurídica antes da publicação para produção.'] },
      ],
    },
    privacidade: {
      title: 'Política de Privacidade',
      intro: 'Resumo operacional baseado no Documento Oficial da Prively. A política publicada final deve corresponder exactamente aos dados e integrações activos no lançamento.',
      sections: [
        { title: 'Dados tratados', paragraphs: ['A Prively trata dados de conta, verificação de identidade, conteúdo, pagamentos, segurança, mensagens, denúncias e registos de auditoria necessários ao funcionamento e à conformidade.'] },
        { title: 'Dados sensíveis', paragraphs: ['Dados relacionados com vida sexual são tratados como sensíveis. O documento prevê recolha apenas do necessário, consentimento explícito e segurança reforçada.'] },
        { title: 'Identidade legal', paragraphs: ['Documento de identidade e selfie são usados para verificar idade e identidade. Depois da aprovação, a identidade social continua separada da identidade legal.'] },
        { title: 'Mensagens e acesso da equipa', paragraphs: ['As conversas são protegidas em trânsito e no armazenamento. O acesso interno ocorre apenas nos casos previstos e fica registado.'] },
        { title: 'Arquivo de conformidade', paragraphs: ['Uma cópia do conteúdo carregado é mantida num arquivo separado para prova legal e combate a abuso, com acesso limitado e auditado.'] },
        { title: 'Direitos do utilizador', paragraphs: ['O documento prevê pedidos de acesso, correcção, portabilidade e eliminação, nos termos da lei aplicável.'] },
        { title: 'Retenção', paragraphs: ['Os prazos e finalidades de retenção devem ser aprovados e publicados na política final antes do lançamento.'] },
      ],
    },
    'conteudo-proibido': {
      title: 'Política de Conteúdo Proibido',
      intro: 'As regras abaixo traduzem os critérios do Documento Oficial que o motor de segurança e a moderação devem aplicar.',
      sections: [
        { title: 'Tolerância zero', paragraphs: ['Menores de 18 anos, incluindo desenho, animação ou montagem digital; conteúdo sem consentimento; vingança íntima; gravações não autorizadas; violência sexual; tortura; mutilação; bestialidade; tráfico; exploração; coerção; violações de direitos de autor ou privacidade; preços de actos sexuais; promoção de serviços sexuais pagos; vírus, fraude e roubo de dados são proibidos.'] },
        { title: 'Detecção e decisão', paragraphs: ['A análise automática sinaliza uploads e a equipa humana toma a decisão final. Casos graves têm prioridade máxima.'] },
        { title: 'Denúncias', paragraphs: ['Perfis, publicações, mensagens e pedidos de encontro têm mecanismos de denúncia. Cada remoção, suspensão, aprovação ou alteração relevante fica registada em auditoria.'] },
        { title: 'Medidas', paragraphs: ['Uma violação pode levar a remoção, suspensão, banimento e, quando a lei exigir, comunicação às autoridades.'] },
      ],
    },
    reembolsos: {
      title: 'Política de Reembolsos e Disputas',
      intro: 'Resumo operacional das regras financeiras descritas no Documento Oficial. O texto final deve ser validado juridicamente e publicado antes do lançamento.',
      sections: [
        { title: 'Registo imutável', paragraphs: ['Pagamentos, reversões, reembolsos e disputas são tratados como novos registos. O ledger não é apagado nem reescrito.'] },
        { title: 'Escrow', paragraphs: ['Em pedidos personalizados, leilões e encomendas de produtos, o dinheiro fica retido até confirmação da entrega ou até 72 horas sem disputa. Quando há disputa, o suporte decide.'] },
        { title: 'Assinaturas', paragraphs: ['Uma assinatura pode ser cancelada a qualquer momento e o cliente mantém o acesso até ao fim do período já pago. Renovação automática depende de saldo disponível.'] },
        { title: 'Estornos e fraude', paragraphs: ['Estornos e fraude podem resultar em dedução dos ganhos da criadora, de acordo com as regras publicadas.'] },
      ],
    },
    cookies: {
      title: 'Política de Cookies e armazenamento local',
      intro: 'Documento de transparência operacional. A versão final deve reflectir apenas mecanismos efectivamente usados na publicação.',
      sections: [
        { title: 'Finalidade', paragraphs: ['A plataforma usa armazenamento do dispositivo para preferências de experiência, modo económico e elementos de discrição, além dos mecanismos necessários à sessão e ao funcionamento da aplicação.'] },
        { title: 'PWA', paragraphs: ['A Prively pode ser instalada como PWA. O modo discreto também pode usar manifesto e identidade visual neutros no dispositivo.'] },
        { title: 'Transparência', paragraphs: ['A política publicada final deve listar os mecanismos activos, as finalidades e os períodos aplicáveis, sem descrever tecnologias que não estejam em utilização.'] },
      ],
    },
  },
  en: {
    termos: {
      title: 'Terms for clients and creators',
      intro: 'Operational summary based on the Official Prively Document. The final legal version requires review and approval in Mozambique before public launch.',
      sections: [
        { title: 'Who may use Prively', paragraphs: ['Prively is for adults only. Every client and creator must complete age and identity verification. Without verification, adult content, spending and withdrawals remain blocked.'] },
        { title: 'Accounts and pseudonyms', paragraphs: ['Clients may use a pseudonym and avatar without exposing their legal name to creators. Legal identity is stored for verification and compliance.'] },
        { title: 'Content and consent', paragraphs: ['The uploader declares that every person appearing in the content is an adult and consented to recording and publication. Non-consensual content, intimate revenge content and hidden recordings are prohibited.'] },
        { title: 'Prohibited content', paragraphs: ['Minors, sexual violence, torture, mutilation, bestiality, trafficking, exploitation, coercion, copyright or privacy violations, promotion of paid sexual services and fraud are prohibited.'] },
        { title: 'Social meetings', paragraphs: ['The social agenda is free. Prively does not charge for meetings, set sexual-act prices, maintain a sexual-services catalogue, suggest hotels or guarantee safety, attendance, payment or meeting conditions.'] },
        { title: 'Payments', paragraphs: ['Subscriptions, PPV, paid messages, lives, calls, tips, gifts, custom requests, auctions, bundles and products use the platform payment layer. For creators, the Creator Terms v1.0.0 define 20 percent on subscriptions, PPV, paid messages and lives, 10 percent on tips, and 0 percent on in-person meetings.'] },
        { title: 'Privacy and staff access', paragraphs: ['Staff do not routinely read conversations. Access to reported, flagged or legally requested content must be justified and logged. Private-message access requires second-person approval.'] },
        { title: 'Applicable law', paragraphs: ['The Creator Terms v1.0.0 specify Mozambican law and the courts of Maputo. The document remains subject to legal review before production publication.'] },
      ],
    },
    privacidade: {
      title: 'Privacy Policy',
      intro: 'Operational summary based on the Official Prively Document. The final published policy must match the actual launch data flows and integrations.',
      sections: [
        { title: 'Data processed', paragraphs: ['Prively processes account, identity verification, content, payments, safety, messages, reports and audit data required for operation and compliance.'] },
        { title: 'Sensitive data', paragraphs: ['Sex-life related data is treated as sensitive. The document calls for data minimisation, explicit consent and reinforced security.'] },
        { title: 'Legal identity', paragraphs: ['Identity documents and selfies are used for age and identity verification. After approval, social identity remains separate from legal identity.'] },
        { title: 'Messages', paragraphs: ['Conversations are protected in transit and at rest. Internal access is limited to the cases described by the policy and is logged.'] },
        { title: 'Compliance archive', paragraphs: ['A separate compliance copy of uploaded content is retained for legal evidence and abuse prevention, with restricted and audited access.'] },
        { title: 'User rights', paragraphs: ['The document provides for access, correction, portability and deletion requests as permitted by applicable law.'] },
      ],
    },
    'conteudo-proibido': {
      title: 'Prohibited Content Policy',
      intro: 'The rules below translate the Official Document into the operational content-safety policy.',
      sections: [
        { title: 'Zero tolerance', paragraphs: ['Minors, including drawings, animation or digital montages; non-consensual content; intimate revenge; unauthorised recordings; sexual violence; torture; mutilation; bestiality; trafficking; exploitation; coercion; copyright or privacy violations; sexual-act pricing; promotion of paid sexual services; malware, fraud and data theft are prohibited.'] },
        { title: 'Detection and decision', paragraphs: ['Automated systems flag uploads and human moderation makes the final decision. Severe cases receive maximum priority.'] },
        { title: 'Reports and actions', paragraphs: ['Profiles, posts, messages and meeting requests expose reporting mechanisms. Removals, suspensions, approvals and material changes are recorded in audit logs.'] },
      ],
    },
    reembolsos: {
      title: 'Refunds and Disputes Policy',
      intro: 'Operational summary of the financial rules in the Official Document. Final text requires legal approval before launch.',
      sections: [
        { title: 'Immutable records', paragraphs: ['Payments, reversals, refunds and disputes are represented as new ledger records. Historical entries are not rewritten.'] },
        { title: 'Escrow', paragraphs: ['For custom requests, auctions and product orders, funds remain held until delivery is confirmed or 72 hours pass without a dispute. Disputed cases are decided by support.'] },
        { title: 'Subscriptions', paragraphs: ['Clients may cancel at any time and keep access until the paid period ends. Automatic renewal depends on available wallet funds.'] },
      ],
    },
    cookies: {
      title: 'Cookies and Local Storage Policy',
      intro: 'Operational transparency document. The final version must list only mechanisms actually active in production.',
      sections: [
        { title: 'Purpose', paragraphs: ['The application uses device storage for experience preferences, economic mode and discreet-mode controls, in addition to mechanisms required for sessions and normal operation.'] },
        { title: 'PWA', paragraphs: ['Prively can be installed as a PWA. Discreet mode can use a neutral manifest and neutral visual identity on the device.'] },
      ],
    },
  },
  fr: {
    termos: {
      title: 'Conditions pour les clients et les créatrices',
      intro: 'Résumé opérationnel basé sur le Document Officiel de Prively. La version juridique finale doit être révisée et approuvée au Mozambique avant le lancement public.',
      sections: [
        { title: 'Utilisateurs autorisés', paragraphs: ['Prively est réservée aux adultes. Chaque client et chaque créatrice doit terminer la vérification de l’âge et de l’identité. Sans vérification, le contenu adulte, les dépenses et les retraits restent bloqués.'] },
        { title: 'Comptes et pseudonymes', paragraphs: ['Le client peut utiliser un pseudonyme et un avatar sans exposer son nom légal aux créatrices. L’identité légale est conservée pour la vérification et la conformité.'] },
        { title: 'Contenu et consentement', paragraphs: ['La personne qui publie déclare que toute personne apparaissant dans le contenu est majeure et a consenti à l’enregistrement et à la publication. Le contenu non consenti, la vengeance intime et les enregistrements cachés sont interdits.'] },
        { title: 'Rencontres sociales', paragraphs: ['L’agenda social est gratuit. Prively ne facture pas les rencontres, ne fixe pas de prix pour des actes sexuels, ne propose pas de catalogue de services sexuels, ne suggère pas d’hôtels et ne garantit pas la sécurité ou les conditions de la rencontre.'] },
        { title: 'Paiements', paragraphs: ['Les abonnements, PPV, messages payants, lives, appels, pourboires, cadeaux, demandes personnalisées, enchères, bundles et produits utilisent la couche financière de la plateforme. La commission initiale indiquée dans le Document Officiel est de 30 pour cent, sous réserve de la configuration centrale et des règles publiées.'] },
        { title: 'Confidentialité et accès de l’équipe', paragraphs: ['L’équipe ne lit pas les conversations de manière routinière. L’accès au contenu signalé ou demandé légalement doit être justifié et enregistré. L’accès aux messages privés exige l’approbation d’une deuxième personne.'] },
      ],
    },
    privacidade: {
      title: 'Politique de confidentialité',
      intro: 'Résumé opérationnel basé sur le Document Officiel. La politique finale doit correspondre aux flux de données et aux intégrations réellement actifs.',
      sections: [
        { title: 'Données traitées', paragraphs: ['Prively traite les données de compte, de vérification d’identité, de contenu, de paiements, de sécurité, de messagerie, de signalement et d’audit nécessaires au fonctionnement et à la conformité.'] },
        { title: 'Données sensibles', paragraphs: ['Les données relatives à la vie sexuelle sont traitées comme sensibles. Le document prévoit la minimisation des données, le consentement explicite et une sécurité renforcée.'] },
        { title: 'Identité légale', paragraphs: ['Les pièces d’identité et les selfies servent à la vérification de l’âge et de l’identité. Après approbation, l’identité sociale reste séparée de l’identité légale.'] },
        { title: 'Conversations', paragraphs: ['Les conversations sont protégées en transit et au repos. L’accès interne est limité aux situations prévues et enregistré.'] },
        { title: 'Archive de conformité', paragraphs: ['Une copie séparée du contenu téléchargé est conservée à des fins de preuve légale et de lutte contre les abus, avec accès restreint et audité.'] },
        { title: 'Droits', paragraphs: ['Le document prévoit des demandes d’accès, de correction, de portabilité et de suppression dans les limites prévues par la loi applicable.'] },
      ],
    },
    'conteudo-proibido': {
      title: 'Politique de contenu interdit',
      intro: 'Ces règles traduisent les critères du Document Officiel en règles opérationnelles de sécurité du contenu.',
      sections: [
        { title: 'Tolérance zéro', paragraphs: ['Les mineurs, y compris dessins, animations ou montages numériques; le contenu non consenti; la vengeance intime; les enregistrements non autorisés; la violence sexuelle; la torture; la mutilation; la bestialité; la traite; l’exploitation; la coercition; les violations du droit d’auteur ou de la vie privée; les prix d’actes sexuels; la promotion de services sexuels payants; les logiciels malveillants, la fraude et le vol de données sont interdits.'] },
        { title: 'Détection et décision', paragraphs: ['Les systèmes automatisés signalent les téléchargements et la modération humaine prend la décision finale. Les cas graves sont traités en priorité maximale.'] },
      ],
    },
    reembolsos: {
      title: 'Politique de remboursements et litiges',
      intro: 'Résumé opérationnel des règles financières du Document Officiel. Le texte final doit être validé juridiquement avant le lancement.',
      sections: [
        { title: 'Registre immuable', paragraphs: ['Les paiements, annulations, remboursements et litiges sont enregistrés comme de nouvelles écritures. Les écritures historiques ne sont pas réécrites.'] },
        { title: 'Escrow', paragraphs: ['Pour les demandes personnalisées, les enchères et les commandes de produits, les fonds restent retenus jusqu’à confirmation de livraison ou 72 heures sans litige. Les litiges sont traités par le support.'] },
        { title: 'Abonnements', paragraphs: ['Le client peut annuler à tout moment et conserver l’accès jusqu’à la fin de la période payée. Le renouvellement automatique dépend du solde disponible.'] },
      ],
    },
    cookies: {
      title: 'Politique Cookies et stockage local',
      intro: 'Document de transparence opérationnelle. La version finale doit décrire uniquement les mécanismes réellement actifs en production.',
      sections: [
        { title: 'Finalité', paragraphs: ['L’application utilise le stockage du terminal pour les préférences d’expérience, le mode économique et les contrôles de discrétion, en plus des mécanismes nécessaires aux sessions et au fonctionnement normal.'] },
        { title: 'PWA', paragraphs: ['Prively peut être installée comme PWA. Le mode discret peut utiliser un manifeste et une identité visuelle neutres sur l’appareil.'] },
      ],
    },
  },
};

function getLegalDoc(language: string, slug: string): LegalDoc | null {
  const locale = legalByLanguage[language] ?? legalByLanguage['pt-MZ'];
  return locale[slug] ?? legalByLanguage['pt-MZ'][slug] ?? null;
}

const legalKey = (path: string) => path.split('/').filter(Boolean).at(-1) ?? 'termos';

export function InfoPage() {
  const { pathname } = useLocation();
  const { t, i18n } = useTranslation();
  const slug = legalKey(pathname);
  const isHelp = pathname.startsWith('/ajuda');
  const isAbout = pathname.startsWith('/sobre');
  const key = isHelp ? 'help' : isAbout ? 'about' : `legal.${slug}`;
  const Icon = isHelp ? Lifebuoy : isAbout ? Question : ShieldCheck;
  const legalDoc = !isHelp && !isAbout ? getLegalDoc(i18n.language, slug) : null;

  if (legalDoc) {
    return <section className="mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-16">
      <PageFrame icon={Icon} title={legalDoc.title} intro={legalDoc.intro} />
      <div className="mt-6 space-y-4">
        {legalDoc.sections.map((section) => <Ficha key={section.title} className="p-6">
          <h2 className="text-xl font-semibold text-bone-50">{section.title}</h2>
          <div className="mt-3 space-y-3">
            {section.paragraphs.map((paragraph) => <p key={paragraph} className="text-sm leading-7 text-bone-300">{paragraph}</p>)}
          </div>
        </Ficha>)}
      </div>
      <Ficha className="mt-5 p-5 text-sm leading-7 text-bone-400">
        {t('experience.pages.info.note')}
      </Ficha>
    </section>;
  }

  return <section className="mx-auto max-w-5xl px-5 py-12 md:px-8 md:py-16">
    <PageFrame icon={Icon} title={t(`experience.pages.${key}.title`)} intro={t(`experience.pages.${key}.intro`)} detail={t(`experience.pages.${key}.detail`)} />
    <Ficha className="mt-5 p-6 text-sm leading-7 text-bone-300">
      <div className="flex items-center gap-2 text-bone-500"><FileText size={18} weight="duotone" /><span>{t('experience.pages.info.note')}</span></div>
    </Ficha>
  </section>;
}
