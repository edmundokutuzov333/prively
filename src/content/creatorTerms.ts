export const CREATOR_TERMS_VERSION = '1.0.0';

export const creatorTermDeclarations = [
  { key: 'age_18', text: 'Declaro que tenho 18 anos ou mais e que a minha idade é verdadeira.' },
  { key: 'accept_terms', text: 'Li, compreendi e aceito integralmente estes Termos e Condições.' },
  { key: 'commission_rates', text: 'Aceito a comissão de 20% sobre assinaturas, PPV, mensagens e lives, e 10% sobre gorjetas.' },
  { key: 'identity_verification', text: 'Autorizo a verificação da minha identidade e idade, incluindo envio de documento e selfie.' },
  { key: 'all_involved_adults_consent', text: 'Confirmo que todos os envolvidos no meu Conteúdo são maiores de 18 anos e consentiram.' },
  { key: 'encounters_not_prively', text: 'Compreendo que a Prively não é parte em encontros presenciais e não cobra comissão sobre eles.' },
  { key: 'prohibited_content', text: 'Compreendo que é proibido publicar conteúdo de menores, não consensual, violento, bestial ou ilegal.' },
  { key: 'content_rights', text: 'Confirmo que tenho direitos sobre o Conteúdo que publico e que não violo direitos de terceiros.' },
  { key: 'privacy_sensitive_data', text: 'Aceito que os meus dados pessoais e sensíveis sejam tratados conforme a Política de Privacidade.' },
  { key: 'pending_balance_retention', text: 'Compreendo que posso encerrar a conta, mas que saldos pendentes podem ser retidos por investigação.' },
  { key: 'no_illegal_use', text: 'Comprometo-me a não usar a Prively para fins ilegais, incluindo tráfico, exploração ou lenocínio.' },
  { key: 'no_income_guarantee', text: 'Compreendo que a Prively não garante rendimento, visibilidade ou assinantes.' },
  { key: 'essential_communications', text: 'Aceito receber comunicações essenciais sobre a conta, pagamentos e segurança.' },
  { key: 'truthful_information', text: 'Declaro que todas as informações que forneci são verdadeiras e completas.' },
  { key: 'suspension_termination', text: 'Aceito que a Prively suspenda ou encerre a conta em caso de violação destes Termos.' },
  { key: 'mozambique_law_maputo_forum', text: 'Aceito a lei moçambicana e o foro de Maputo para resolver litígios.' },
] as const;

export type CreatorTermDeclarationKey = typeof creatorTermDeclarations[number]['key'];

export const creatorTermsSections = [
  {
    number: '1',
    title: 'Definições',
    paragraphs: [
      'Prively: plataforma moçambicana de conteúdo adulto por assinatura, com funcionalidades sociais e de agendamento.',
      'Criadora: pessoa maior de 18 anos que cria, publica e monetiza conteúdo na Prively.',
      'Cliente: utilizador maior de 18 anos que consome, compra ou interage com conteúdo.',
      'Conteúdo: fotos, vídeos, áudios, textos, transmissões ao vivo, mensagens e outros materiais publicados pela Criadora.',
      'Comissão: percentagem retida pela Prively sobre transacções.',
      'Encontro: qualquer interacção presencial entre Criadora e Cliente, fora da plataforma.',
    ],
  },
  {
    number: '2',
    title: 'Elegibilidade e Verificação',
    paragraphs: [
      '2.1. A Criadora declara ter 18 anos completos e capacidade legal para contratar.',
      '2.2. A Criadora obriga-se a fornecer:',
    ],
    bullets: ['documento de identificação válido (BI, passaporte ou equivalente);', 'selfie de verificação;', 'comprovativo de idade;', 'informações de contacto verdadeiras.'],
    paragraphsAfter: [
      '2.3. A Prively pode recusar, suspender ou encerrar qualquer conta sem justificação, especialmente em caso de suspeita de fraude, menoridade, coerção ou violação legal.',
      '2.4. A verificação de identidade é obrigatória. Sem ela, a conta não é activada.',
    ],
  },
  {
    number: '3',
    title: 'Conta e Segurança',
    paragraphs: [
      '3.1. A Criadora é responsável por:',
    ],
    bullets: ['manter a password segura;', 'não partilhar a conta;', 'comunicar imediatamente qualquer acesso não autorizado;', 'usar autenticação de dois factores quando disponível.'],
    paragraphsAfter: [
      '3.2. A Prively pode implementar verificação por SMS, email, PIN ou biometria.',
      '3.3. A Criadora pode solicitar modo discreto, notificações neutras e ocultação de dados sensíveis.',
    ],
  },
  {
    number: '4',
    title: 'Conteúdo da Criadora',
    paragraphs: [
      '4.1. A Criadora mantém a propriedade do seu Conteúdo.',
      '4.2. A Criadora concede à Prively uma licença não exclusiva, mundial e gratuita para:',
    ],
    bullets: [
      'hospedar, armazenar, processar e exibir o Conteúdo;',
      'promover a conta e o Conteúdo na plataforma e em canais próprios;',
      'criar miniaturas, pré-visualizações e marcas de água;',
      'cumprir obrigações legais e pedidos de autoridades competentes.',
    ],
    paragraphsAfter: [
      '4.3. A Criadora define o que é:',
    ],
    bulletsAfter: ['público;', 'pago por assinatura;', 'pay-per-view;', 'privado;', 'temporário.'],
    paragraphsAfter2: [
      '4.4. A Criadora pode apagar Conteúdo, mas compreende que cópias podem persistir em cache, backups ou ter sido adquiridas por Clientes antes da remoção.',
    ],
  },
  {
    number: '5',
    title: 'Conteúdo Proibido',
    intro: 'É estritamente proibido publicar, enviar ou promover:',
    bullets: [
      'menores de 18 anos, mesmo que simulado, desenhado, animado ou deepfake;',
      'conteúdo não consensual, revenge porn ou gravações sem autorização;',
      'violência sexual, tortura, mutilação ou actos não consensuais;',
      'bestialidade;',
      'tráfico humano, exploração sexual ou coerção;',
      'conteúdo que viole direitos de autor, marcas ou privacidade de terceiros;',
      'dados pessoais de terceiros sem consentimento;',
      'conteúdo que promova serviços sexuais pagos, preços de actos sexuais ou lenocínio;',
      'malware, phishing ou esquemas fraudulentos.',
    ],
    paragraphsAfter: [
      '5.1. A violação implica remoção imediata, suspensão da conta e possível comunicação às autoridades.',
    ],
  },
  {
    number: '6',
    title: 'Licença e Direitos',
    paragraphs: [
      '6.1. A Criadora declara que:',
    ],
    bullets: [
      'é maior de idade;',
      'todos os envolvidos no Conteúdo consentiram;',
      'tem direitos sobre o Conteúdo;',
      'o Conteúdo não viola leis moçambicanas nem direitos de terceiros.',
    ],
    paragraphsAfter: [
      '6.2. A Prively pode remover Conteúdo que viole estes Termos, sem reembolso de comissões já processadas.',
    ],
  },
  {
    number: '7',
    title: 'Pagamentos, Comissões e Levantamentos',
    paragraphs: [
      '7.1. A Prively retém:',
    ],
    bullets: [
      '20% sobre assinaturas, PPV, mensagens pagas e lives;',
      '10% sobre gorjetas;',
      '0% sobre encontros presenciais.',
    ],
    paragraphsAfter: [
      '7.2. A Prively pode alterar comissões com aviso prévio de 30 dias.',
      '7.3. Levantamentos:',
    ],
    bulletsAfter: [
      'mínimo de 500 MZN;',
      'via M-Pesa, e-Mola, mKesh, transferência bancária ou outro método disponível;',
      'processamento em 3 a 7 dias úteis;',
      'sujeito a verificação de identidade e prevenção de fraude.',
    ],
    paragraphsAfter2: [
      '7.4. A Criadora é responsável por declarar e pagar impostos sobre os seus rendimentos.',
      '7.5. Chargebacks, fraudes e pagamentos revertidos podem ser deduzidos do saldo da Criadora.',
    ],
  },
  {
    number: '8',
    title: 'Funcionalidade de Agenda e Encontros',
    paragraphs: [
      '8.1. A Prively disponibiliza uma agenda de disponibilidade e um chat para marcação de encontros sociais entre adultos consentintes.',
      '8.2. A Prively:',
    ],
    bullets: [
      'não é parte no encontro;',
      'não cobra comissão sobre o encontro;',
      'não define preços de actos sexuais;',
      'não garante segurança, comparecimento, pagamento ou condições do encontro;',
      'não intermedeia serviços sexuais.',
    ],
    paragraphsAfter: [
      '8.3. Qualquer encontro é um acordo privado entre Criadora e Cliente. Ambos são responsáveis por:',
    ],
    bulletsAfter: [
      'cumprir a lei moçambicana;',
      'respeitar consentimento;',
      'garantir segurança;',
      'não praticar actos ilícitos.',
    ],
    paragraphsAfter2: [
      '8.4. A Criadora pode recusar qualquer pedido, bloquear Clientes e usar o botão de pânico.',
      '8.5. A Prively pode remover a funcionalidade de encontros em qualquer momento, por razões legais, técnicas ou de segurança.',
    ],
  },
  {
    number: '9',
    title: 'Privacidade e Dados Pessoais',
    paragraphs: [
      '9.1. A Prively trata dados pessoais, incluindo dados sensíveis sobre vida sexual, de acordo com a legislação moçambicana aplicável.',
      '9.2. A Criadora consente o tratamento dos seus dados para:',
    ],
    bullets: [
      'criação e gestão da conta;',
      'verificação de idade e identidade;',
      'processamento de pagamentos;',
      'moderação e segurança;',
      'cumprimento legal.',
    ],
    paragraphsAfter: [
      '9.3. A Prively implementa medidas técnicas e organizativas de segurança, mas nenhum sistema é 100% inviolável.',
      '9.4. A Criadora pode solicitar acesso, correcção, portabilidade ou eliminação dos seus dados, nos termos da lei.',
    ],
  },
  {
    number: '10',
    title: 'Moderação e Denúncias',
    paragraphs: [
      '10.1. A Prively pode moderar Conteúdo por IA e revisão humana.',
      '10.2. Qualquer utilizador pode denunciar Conteúdo, perfis, mensagens ou encontros.',
      '10.3. A Prively coopera com autoridades competentes em investigações criminais.',
    ],
  },
  {
    number: '11',
    title: 'Suspensão e Encerramento',
    paragraphs: [
      '11.1. A Prively pode suspender ou encerrar contas por:',
    ],
    bullets: [
      'violação destes Termos;',
      'fraude;',
      'risco legal;',
      'inactividade prolongada;',
      'ordem judicial ou administrativa.',
    ],
    paragraphsAfter: [
      '11.2. A Criadora pode encerrar a conta a qualquer momento, desde que não tenha saldos pendentes ou obrigações em curso.',
      '11.3. Saldos podem ser retidos por investigação de fraude, chargeback ou obrigação legal.',
    ],
  },
  {
    number: '12',
    title: 'Limitação de Responsabilidade',
    paragraphs: [
      '12.1. Na máxima medida permitida por lei, a Prively não é responsável por:',
    ],
    bullets: [
      'actos praticados por Criadoras ou Clientes fora da plataforma;',
      'encontros presenciais;',
      'perda de rendimentos;',
      'remoção de Conteúdo por violação legal;',
      'falhas de terceiros (PSP, operadoras, internet).',
    ],
    paragraphsAfter: [
      '12.2. A Prively não garante rendimento mínimo, visibilidade ou número de assinantes.',
    ],
  },
  {
    number: '13',
    title: 'Alterações aos Termos',
    paragraphs: [
      '13.1. A Prively pode alterar estes Termos. Alterações relevantes serão comunicadas com 15 dias de antecedência.',
      '13.2. O uso continuado da plataforma após alterações constitui aceitação.',
    ],
  },
  {
    number: '14',
    title: 'Lei Aplicável e Foro',
    paragraphs: [
      '14.1. Estes Termos regem-se pela lei moçambicana.',
      '14.2. Qualquer litígio será resolvido no foro da cidade de Maputo, salvo norma legal imperativa em sentido diferente.',
    ],
  },
  {
    number: '15',
    title: 'Declarações Obrigatórias',
    intro: 'Para concluir o cadastro, a Criadora deve marcar todas as caixas abaixo.',
    isDeclarations: true,
  },
  {
    number: '16',
    title: 'Assinatura Digital',
    paragraphs: [
      'Ao clicar em “Concordo e quero criar conta”, a Criadora declara que leu, compreendeu e aceitou todos os Termos acima, e que as declarações marcadas são verdadeiras.',
      'Botão: [ Criar conta ] — só activo depois de todas as caixas marcadas.',
    ],
  },
] as const;

export const creatorTermsClosingNote = 'este documento é um modelo simulado para discussão. Não constitui aconselhamento jurídico. Antes de entrar em produção, deve ser revisto por um advogado em Moçambique, com atenção especial às cláusulas sobre encontros, dados sensíveis, comissões e responsabilidade da plataforma';
