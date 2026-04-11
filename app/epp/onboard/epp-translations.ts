/**
 * EPP onboarding translations.
 *
 * Self-contained dictionary for the /epp/onboard flow. Lives outside the
 * main app i18n because the EPP page is a standalone "exclusive invite"
 * experience with its own copy and styling, separate from the dashboard.
 *
 * Sourced from the original Operon_Elite_Partner_Onboarding.html.
 * Languages: en, tc (zh-tw), sc (zh-cn), ko, vi.
 * `th` is stubbed to en — TODO: translate before TH market launch.
 */

export type EppLang = 'en' | 'tc' | 'sc' | 'ko' | 'vi' | 'th';

interface EppSec {
  n: string;
  t: string;
  b: string;
}

export interface EppLangPack {
  // Lang pill labels (always shown in native script)
  pillLabel: string;

  // Step 0: Letter
  invLabel: string;
  invExp: string;
  invExpDays: string;
  greeting: string;
  p1: string;
  p2: string;
  p3: string;
  p4: string;
  sumLabel: string;
  sumItems: string[]; // 6 bullet items
  sumNote: string;
  close: string;
  sig: string;
  btnReview: string;

  // Step 1: T&Cs
  tcEy: string;
  tcTitle: string;
  tcSub: string;
  chk1: string;
  chk2: string;
  chk3: string;
  btnAccept: string;
  btnBack: string;

  // Step 2: Form (now wallet-connect step)
  formEy: string;
  formTitle: string;
  formSub: string;
  labelEmail: string;
  labelChain: string;
  labelWallet: string;
  labelTg: string;
  labelTgOpt: string;
  errEmail: string;
  hintWallet: string;
  btnConnect: string;
  btnConnected: string;
  btnCreate: string;
  walletPayoutNote: string;
  signingMessage: string;

  // Step 3: Confirmation
  confLabel: string;
  confTitle: string;
  codeLabel: string;
  btnCopy: string;
  btnLink: string;
  btnShare: string;
  confEmailBefore: string;
  confEmailAfter: string;
  next1: string;
  next2: string;
  next3: string;
  btnDash: string;
  footPayout: string;
  footOn: string;

  // T&C accordion sections
  sec: EppSec[];

  // Toasts
  toastCodeCopied: string;
  toastLinkCopied: string;

  // Errors
  errInviteInvalid: string;
  errInviteUsed: string;
  errInviteExpired: string;
  errCreateFailed: string;
  errSignatureRejected: string;
}

const en: EppLangPack = {
  pillLabel: 'EN',
  invLabel: 'By Invitation Only',
  invExp: 'This invitation is valid until accepted',
  invExpDays: '',
  greeting: 'Dear',
  p1: 'Operon is preparing its Genesis Node Sale — 100,000 network participation licences across 40 price tiers. Before the sale opens to the public, we are assembling a private partner network to represent the project.',
  p2: 'We would like to invite you to the Elite Partner Programme.',
  p3: 'As a partner, your referral code provides two distinct advantages. First, your buyers gain access to the whitelist sale — the earliest tiers, before the public sale opens. Second, every purchase through your code receives a preferential discount, applied at any tier, at any time during the sale.',
  p4: 'You earn commission on every attributed sale across multiple referral levels. The programme includes structured tier advancement, stipends at qualifying thresholds, milestone bonuses, and ongoing participation in post-TGE token rewards.',
  sumLabel: 'Programme Overview',
  sumItems: [
    'Whitelist access for your network',
    'Preferential buyer discount',
    'Multi-level commission structure',
    'Monthly stipend at qualifying tiers',
    'Milestone bonuses',
    'Post-TGE reward participation',
  ],
  sumNote: 'Full programme documentation — including the rate schedule, tier thresholds, and commission structure — will be provided upon acceptance.',
  close: 'With regards,',
  sig: 'The Operon Team',
  btnReview: 'Review programme terms',

  tcEy: 'Programme Terms',
  tcTitle: 'Terms & Conditions',
  tcSub: 'Full rate schedule provided upon acceptance.',
  chk1: 'I accept the Elite Partner Programme Terms & Conditions (v1.0)',
  chk2: 'I confirm I am not a US person and am not acting on behalf of any US person',
  chk3: 'I understand that Operon Nodes are network participation licences, not securities or investments',
  btnAccept: 'Accept and continue',
  btnBack: 'Back',

  formEy: 'Account Setup',
  formTitle: 'Partner details',
  formSub: 'Connect your wallet — it will be used both to sign in and to receive commission payouts.',
  labelEmail: 'Email address',
  labelChain: 'Payout chain',
  labelWallet: 'Connected wallet',
  labelTg: 'Telegram',
  labelTgOpt: '— optional',
  errEmail: 'Enter a valid email address',
  hintWallet: 'Commission payouts will be sent to this address. Reconnect a different wallet to change it.',
  btnConnect: 'Connect wallet',
  btnConnected: 'Wallet connected',
  btnCreate: 'Sign and create partner account',
  walletPayoutNote: 'The wallet you connect is your payout wallet. You can change it later by contacting support.',
  signingMessage: 'Please sign the message in your wallet to confirm.',

  confLabel: 'Account Created',
  confTitle: 'Welcome to the programme,',
  codeLabel: 'Your Referral Code',
  btnCopy: 'Copy code',
  btnLink: 'Copy link',
  btnShare: 'Share',
  confEmailBefore: 'Programme documentation will be sent to',
  confEmailAfter: '— including the full rate schedule, tier thresholds, milestone structure, and pitch resources.',
  next1: 'Share your code with prospective buyers to give them whitelist access and a preferential discount',
  next2: 'Review the programme documentation sent to your email',
  next3: 'Your partner dashboard is available now',
  btnDash: 'Open dashboard',
  footPayout: 'Commission payouts to',
  footOn: 'on',

  sec: [
    { n: '1', t: 'Acceptance and Scope', b: 'By completing this onboarding process, you accept these Terms in full. The Programme is invitation-only. These Terms incorporate the Schedule of Rates, which may be updated with 14 days\' written notice.' },
    { n: '2', t: 'Definitions', b: '<strong>$OPRN</strong> — the native utility token of the Operon Network, with a fixed total supply of 42,000,000,000. <strong>Node</strong> — an ERC-721 or BEP-721 NFT representing a network participation licence. <strong>Credited Amount</strong> — the cumulative dollar value of Node purchases attributed to the Partner, weighted by cascade level.' },
    { n: '3', t: 'Programme Tiers and Advancement', b: 'The Programme consists of six tiers with automatic advancement based on Credited Amount. Partners who do not maintain 10% of their tier threshold annually may be moved down one tier with 30 days\' written notice.' },
    { n: '4', t: 'Commissions and Payment', b: 'Pre-TGE commissions are paid in ETH or USDC within 14 days of each biweekly Merkle root publication. Post-TGE commissions are paid in $OPRN from the Referral and Distribution Pool. Commission rates are provided in the programme documentation sent upon acceptance.' },
    { n: '5', t: 'Stipend and Milestone Bonuses', b: 'Partners at qualifying tiers receive a monthly stipend paid biweekly in USDC, subject to a minimum sales activity gate. One-time milestone bonuses are payable upon reaching Credited Amount thresholds. Full schedule provided upon acceptance.' },
    { n: '6', t: 'Partner Obligations', b: 'Partners shall describe Nodes as network participation licences. No guaranteed returns shall be communicated. US persons shall not be targeted for the token component. Programme terms are confidential. All marketing materials must use approved branding.' },
    { n: '7', t: 'Content, Data Protection, and Confidentiality', b: 'Partners retain ownership of content created for the Programme. Operon receives a perpetual licence to use such content. Partners shall handle prospect data in compliance with applicable privacy laws. All programme details remain confidential for two years following deactivation.' },
    { n: '8', t: 'Modification, Deactivation, and Governing Law', b: 'Programme Terms may be modified with 30 days\' notice. The Schedule of Rates may be modified with 14 days\' notice. Deactivation for cause terminates cascade earnings immediately. Deactivation without cause provides a six-month wind-down. Governing law: Republic of Singapore. Disputes: SIAC arbitration.' },
    { n: '9', t: 'Changes to These Terms', b: 'These Terms (and the Schedule of Rates incorporated by reference) may be amended from time to time with prior notice as set out above. Continued participation in the Programme after the effective date of any amendment constitutes acceptance of the amended Terms.' },
  ],

  toastCodeCopied: 'Code copied',
  toastLinkCopied: 'Link copied',
  errInviteInvalid: 'This invitation link is not valid. Please check the link and try again.',
  errInviteUsed: 'This invitation has already been used.',
  errInviteExpired: 'This invitation has expired. Please contact your point of contact at Operon.',
  errCreateFailed: 'We could not create your partner account. Please try again or contact support.',
  errSignatureRejected: 'Signature was rejected. Please try again to confirm wallet ownership.',
};

const tc: EppLangPack = {
  pillLabel: '繁中',
  invLabel: '僅限受邀者',
  invExp: '此邀請在接受前持續有效',
  invExpDays: '',
  greeting: '親愛的',
  p1: 'Operon 正在籌備創世節點銷售——共計 100,000 個網路參與許可，分佈於 40 個價格層級。在公開銷售啟動之前，我們正在組建一個私人合作夥伴網路，以代表本項目進行推廣。',
  p2: '我們誠摯邀請您加入菁英合作夥伴計畫。',
  p3: '作為合作夥伴，您的推薦碼將提供兩項獨立優勢。第一，您的買家可提前參與白名單銷售——在公開銷售啟動前以最早期的層級價格購買。第二，所有透過您推薦碼完成的購買均享有優惠折扣，適用於任何層級、銷售期間的任何時段。',
  p4: '您將在多層推薦結構中，就每一筆歸屬於您的銷售獲得佣金。計畫包含結構化的層級晉升機制、達標後的定期津貼、里程碑獎金，以及 TGE 後持續的代幣獎勵分潤。',
  sumLabel: '計畫概覽',
  sumItems: [
    '為您的網路提供白名單資格',
    '優惠買家折扣',
    '多層佣金結構',
    '達標層級每月津貼',
    '里程碑獎金',
    'TGE 後獎勵分潤',
  ],
  sumNote: '完整計畫文件——包括費率表、層級門檻及佣金結構——將在您接受邀請後提供。',
  close: '謹致問候，',
  sig: 'Operon 團隊',
  btnReview: '檢閱計畫條款',

  tcEy: '計畫條款',
  tcTitle: '條款與細則',
  tcSub: '完整費率表將在接受後提供。',
  chk1: '我接受菁英合作夥伴計畫條款與細則（v1.0）',
  chk2: '我確認本人並非美國公民，亦非代表任何美國公民行事',
  chk3: '我了解 Operon 節點為網路參與許可，並非證券或投資產品',
  btnAccept: '接受並繼續',
  btnBack: '返回',

  formEy: '帳戶設定',
  formTitle: '合作夥伴資料',
  formSub: '請連接您的錢包——它將同時用於登入和接收佣金付款。',
  labelEmail: '電子郵件地址',
  labelChain: '佣金付款鏈',
  labelWallet: '已連接錢包',
  labelTg: 'Telegram',
  labelTgOpt: '— 選填',
  errEmail: '請輸入有效的電子郵件地址',
  hintWallet: '佣金將發送至此地址。如需更改，請重新連接其他錢包。',
  btnConnect: '連接錢包',
  btnConnected: '錢包已連接',
  btnCreate: '簽署並建立合作夥伴帳戶',
  walletPayoutNote: '您連接的錢包即為佣金收款錢包。如需變更請聯繫客服。',
  signingMessage: '請在錢包中簽署訊息以確認。',

  confLabel: '帳戶已建立',
  confTitle: '歡迎加入計畫，',
  codeLabel: '您的推薦碼',
  btnCopy: '複製代碼',
  btnLink: '複製連結',
  btnShare: '分享',
  confEmailBefore: '計畫文件將發送至',
  confEmailAfter: '——包括完整費率表、層級門檻、里程碑結構及推廣資源。',
  next1: '分享您的推薦碼，讓買家獲得白名單資格及優惠折扣',
  next2: '查閱已發送至您郵箱的計畫文件',
  next3: '您的合作夥伴儀表板現已開放',
  btnDash: '開啟儀表板',
  footPayout: '佣金付款至',
  footOn: '，鏈：',

  sec: [
    { n: '1', t: '接受與適用範圍', b: '完成本入職流程即表示您完全接受本條款。本計畫僅限受邀者參與。本條款納入費率表，費率表可在提前 14 天書面通知後更新。' },
    { n: '2', t: '定義', b: '<strong>$OPRN</strong>——Operon 網路的原生實用代幣，固定總供應量為 42,000,000,000。<strong>節點</strong>——代表網路參與許可的 ERC-721 或 BEP-721 NFT。<strong>累計金額</strong>——歸屬於合作夥伴的節點購買累計美元價值，按推薦層級加權計算。' },
    { n: '3', t: '計畫層級與晉升', b: '本計畫設有六個層級，根據累計金額自動晉升。連續 12 個月未達到層級門檻 10% 的合作夥伴，可能在提前 30 天書面通知後被降級一層。' },
    { n: '4', t: '佣金與付款', b: 'TGE 前佣金以 ETH 或 USDC 支付，於每兩週 Merkle 根公佈後 14 天內發放。TGE 後佣金以 $OPRN 從推薦與分配池中支付。佣金費率將在接受後的計畫文件中提供。' },
    { n: '5', t: '津貼與里程碑獎金', b: '達標層級的合作夥伴可獲得每月津貼，以 USDC 每兩週發放，需達到最低銷售活動門檻。達到累計金額門檻時可獲一次性里程碑獎金。完整時間表將在接受後提供。' },
    { n: '6', t: '合作夥伴義務', b: '合作夥伴應將節點描述為網路參與許可。不得傳達任何保證收益。不得針對美國公民推廣代幣相關內容。計畫條款屬機密資訊。所有行銷材料須使用經核准的品牌素材。' },
    { n: '7', t: '內容、資料保護與保密', b: '合作夥伴保留為本計畫創作的內容之所有權。Operon 獲得永久許可使用此類內容。合作夥伴應依適用隱私法規處理潛在客戶資料。所有計畫細節在退出後兩年內仍屬機密。' },
    { n: '8', t: '修改、停用與管轄法律', b: '計畫條款可在提前 30 天通知後修改。費率表可在提前 14 天通知後修改。因故停用將立即終止級聯收益。無故停用則提供六個月的緩衝期。管轄法律：新加坡共和國。爭議解決：SIAC 仲裁。' },
    { n: '9', t: '條款變更', b: '本條款（及併入引用的費率表）可不時依上述通知期限進行修訂。修訂生效日後繼續參與計畫即視為接受修訂後之條款。' },
  ],

  toastCodeCopied: '已複製代碼',
  toastLinkCopied: '已複製連結',
  errInviteInvalid: '此邀請連結無效，請檢查後再試。',
  errInviteUsed: '此邀請已被使用。',
  errInviteExpired: '此邀請已過期，請聯繫您在 Operon 的對接人員。',
  errCreateFailed: '無法建立您的合作夥伴帳戶，請重試或聯繫客服。',
  errSignatureRejected: '簽名被拒絕，請再次嘗試以確認錢包所有權。',
};

const sc: EppLangPack = {
  pillLabel: '简中',
  invLabel: '仅限受邀者',
  invExp: '此邀请在接受前持续有效',
  invExpDays: '',
  greeting: '尊敬的',
  p1: 'Operon 正在筹备创世节点销售——共计 100,000 个网络参与许可，分布于 40 个价格层级。在公开销售启动之前，我们正在组建一个私人合作伙伴网络，以代表本项目进行推广。',
  p2: '我们诚挚邀请您加入精英合作伙伴计划。',
  p3: '作为合作伙伴，您的推荐码将提供两项独立优势。第一，您的买家可提前参与白名单销售——在公开销售启动前以最早期的层级价格购买。第二，所有通过您推荐码完成的购买均享有优惠折扣，适用于任何层级、销售期间的任何时段。',
  p4: '您将在多层推荐结构中，就每一笔归属于您的销售获得佣金。计划包含结构化的层级晋升机制、达标后的定期津贴、里程碑奖金，以及 TGE 后持续的代币奖励分润。',
  sumLabel: '计划概览',
  sumItems: [
    '为您的网络提供白名单资格',
    '优惠买家折扣',
    '多层佣金结构',
    '达标层级每月津贴',
    '里程碑奖金',
    'TGE 后奖励分润',
  ],
  sumNote: '完整计划文件——包括费率表、层级门槛及佣金结构——将在您接受邀请后提供。',
  close: '此致敬礼，',
  sig: 'Operon 团队',
  btnReview: '查阅计划条款',

  tcEy: '计划条款',
  tcTitle: '条款与细则',
  tcSub: '完整费率表将在接受后提供。',
  chk1: '我接受精英合作伙伴计划条款与细则（v1.0）',
  chk2: '我确认本人并非美国公民，亦非代表任何美国公民行事',
  chk3: '我了解 Operon 节点为网络参与许可，并非证券或投资产品',
  btnAccept: '接受并继续',
  btnBack: '返回',

  formEy: '账户设置',
  formTitle: '合作伙伴资料',
  formSub: '请连接您的钱包——它将同时用于登录和接收佣金支付。',
  labelEmail: '电子邮件地址',
  labelChain: '佣金支付链',
  labelWallet: '已连接钱包',
  labelTg: 'Telegram',
  labelTgOpt: '— 选填',
  errEmail: '请输入有效的电子邮件地址',
  hintWallet: '佣金将发送至此地址。如需更改，请重新连接其他钱包。',
  btnConnect: '连接钱包',
  btnConnected: '钱包已连接',
  btnCreate: '签署并创建合作伙伴账户',
  walletPayoutNote: '您连接的钱包即为佣金收款钱包。如需变更请联系客服。',
  signingMessage: '请在钱包中签署消息以确认。',

  confLabel: '账户已创建',
  confTitle: '欢迎加入计划，',
  codeLabel: '您的推荐码',
  btnCopy: '复制代码',
  btnLink: '复制链接',
  btnShare: '分享',
  confEmailBefore: '计划文件将发送至',
  confEmailAfter: '——包括完整费率表、层级门槛、里程碑结构及推广资源。',
  next1: '分享您的推荐码，让买家获得白名单资格及优惠折扣',
  next2: '查阅已发送至您邮箱的计划文件',
  next3: '您的合作伙伴仪表板现已开放',
  btnDash: '打开仪表板',
  footPayout: '佣金支付至',
  footOn: '，链：',

  sec: [
    { n: '1', t: '接受与适用范围', b: '完成本入职流程即表示您完全接受本条款。本计划仅限受邀者参与。本条款纳入费率表，费率表可在提前 14 天书面通知后更新。' },
    { n: '2', t: '定义', b: '<strong>$OPRN</strong>——Operon 网络的原生实用代币，固定总供应量为 42,000,000,000。<strong>节点</strong>——代表网络参与许可的 ERC-721 或 BEP-721 NFT。<strong>累计金额</strong>——归属于合作伙伴的节点购买累计美元价值，按推荐层级加权计算。' },
    { n: '3', t: '计划层级与晋升', b: '本计划设有六个层级，根据累计金额自动晋升。连续 12 个月未达到层级门槛 10% 的合作伙伴，可能在提前 30 天书面通知后被降级一层。' },
    { n: '4', t: '佣金与支付', b: 'TGE 前佣金以 ETH 或 USDC 支付，于每两周 Merkle 根公布后 14 天内发放。TGE 后佣金以 $OPRN 从推荐与分配池中支付。佣金费率将在接受后的计划文件中提供。' },
    { n: '5', t: '津贴与里程碑奖金', b: '达标层级的合作伙伴可获得每月津贴，以 USDC 每两周发放，需达到最低销售活动门槛。达到累计金额门槛时可获一次性里程碑奖金。完整时间表将在接受后提供。' },
    { n: '6', t: '合作伙伴义务', b: '合作伙伴应将节点描述为网络参与许可。不得传达任何保证收益。不得针对美国公民推广代币相关内容。计划条款属机密信息。所有营销材料须使用经核准的品牌素材。' },
    { n: '7', t: '内容、数据保护与保密', b: '合作伙伴保留为本计划创作的内容之所有权。Operon 获得永久许可使用此类内容。合作伙伴应依适用隐私法规处理潜在客户数据。所有计划细节在退出后两年内仍属机密。' },
    { n: '8', t: '修改、停用与管辖法律', b: '计划条款可在提前 30 天通知后修改。费率表可在提前 14 天通知后修改。因故停用将立即终止级联收益。无故停用则提供六个月的缓冲期。管辖法律：新加坡共和国。争议解决：SIAC 仲裁。' },
    { n: '9', t: '条款变更', b: '本条款（及并入引用的费率表）可不时依上述通知期限进行修订。修订生效日后继续参与计划即视为接受修订后之条款。' },
  ],

  toastCodeCopied: '已复制代码',
  toastLinkCopied: '已复制链接',
  errInviteInvalid: '此邀请链接无效，请检查后再试。',
  errInviteUsed: '此邀请已被使用。',
  errInviteExpired: '此邀请已过期，请联系您在 Operon 的对接人员。',
  errCreateFailed: '无法创建您的合作伙伴账户，请重试或联系客服。',
  errSignatureRejected: '签名被拒绝，请再次尝试以确认钱包所有权。',
};

const ko: EppLangPack = {
  pillLabel: '한국어',
  invLabel: '초대자 한정',
  invExp: '본 초대는 수락 전까지 유효합니다',
  invExpDays: '',
  greeting: '안녕하세요,',
  p1: 'Operon은 제네시스 노드 세일을 준비하고 있습니다. 40개 가격 등급에 걸쳐 총 100,000개의 네트워크 참여 라이선스가 제공됩니다. 공개 판매가 시작되기 전, 본 프로젝트를 대표할 비공개 파트너 네트워크를 구성하고 있습니다.',
  p2: '엘리트 파트너 프로그램에 귀하를 초대드립니다.',
  p3: '파트너로서 귀하의 추천 코드는 두 가지 독립적인 혜택을 제공합니다. 첫째, 귀하의 구매자들은 화이트리스트 세일에 접근할 수 있습니다 — 공개 판매 이전에 가장 초기 등급의 가격으로 구매할 수 있습니다. 둘째, 귀하의 코드를 통한 모든 구매에는 우대 할인이 적용되며, 이는 판매 기간 중 어떤 등급에서든, 언제든 적용됩니다.',
  p4: '귀하는 다중 추천 레벨에 걸쳐 귀속된 모든 판매에 대해 커미션을 수령합니다. 본 프로그램에는 체계적인 등급 승급, 자격 달성 시 정기 수당, 마일스톤 보너스, 그리고 TGE 이후 지속적인 토큰 보상 참여가 포함됩니다.',
  sumLabel: '프로그램 개요',
  sumItems: [
    '귀하의 네트워크를 위한 화이트리스트 접근',
    '우대 구매자 할인',
    '다중 레벨 커미션 구조',
    '자격 등급 월간 수당',
    '마일스톤 보너스',
    'TGE 이후 보상 참여',
  ],
  sumNote: '전체 프로그램 문서 — 수수료율표, 등급 기준, 커미션 구조 포함 — 는 수락 후 제공됩니다.',
  close: '감사합니다,',
  sig: 'Operon 팀',
  btnReview: '프로그램 약관 검토',

  tcEy: '프로그램 약관',
  tcTitle: '이용약관',
  tcSub: '전체 수수료율표는 수락 후 제공됩니다.',
  chk1: '엘리트 파트너 프로그램 이용약관(v1.0)에 동의합니다',
  chk2: '본인은 미국인이 아니며 미국인을 대리하여 행동하지 않음을 확인합니다',
  chk3: 'Operon 노드가 네트워크 참여 라이선스이며 증권이나 투자 상품이 아님을 이해합니다',
  btnAccept: '동의 및 계속',
  btnBack: '뒤로',

  formEy: '계정 설정',
  formTitle: '파트너 정보',
  formSub: '지갑을 연결하세요 — 로그인과 커미션 수령에 모두 사용됩니다.',
  labelEmail: '이메일 주소',
  labelChain: '커미션 지급 체인',
  labelWallet: '연결된 지갑',
  labelTg: 'Telegram',
  labelTgOpt: '— 선택사항',
  errEmail: '유효한 이메일 주소를 입력하세요',
  hintWallet: '커미션이 이 주소로 지급됩니다. 변경하려면 다른 지갑으로 다시 연결하세요.',
  btnConnect: '지갑 연결',
  btnConnected: '지갑 연결됨',
  btnCreate: '서명하고 파트너 계정 생성',
  walletPayoutNote: '연결한 지갑이 커미션 수령 지갑입니다. 변경하려면 고객지원에 문의하세요.',
  signingMessage: '지갑에서 메시지에 서명하여 확인하세요.',

  confLabel: '계정이 생성되었습니다',
  confTitle: '프로그램에 오신 것을 환영합니다,',
  codeLabel: '귀하의 추천 코드',
  btnCopy: '코드 복사',
  btnLink: '링크 복사',
  btnShare: '공유',
  confEmailBefore: '프로그램 문서가 다음 주소로 전송됩니다:',
  confEmailAfter: '— 전체 수수료율표, 등급 기준, 마일스톤 구조 및 홍보 자료가 포함되어 있습니다.',
  next1: '추천 코드를 공유하여 구매자에게 화이트리스트 접근 및 우대 할인을 제공하세요',
  next2: '이메일로 전송된 프로그램 문서를 확인하세요',
  next3: '파트너 대시보드를 지금 이용할 수 있습니다',
  btnDash: '대시보드 열기',
  footPayout: '커미션 지급 주소:',
  footOn: ', 체인:',

  sec: [
    { n: '1', t: '수락 및 적용 범위', b: '본 온보딩 절차를 완료함으로써 본 약관에 완전히 동의하게 됩니다. 본 프로그램은 초대자 한정입니다. 본 약관에는 수수료율표가 포함되며, 14일 전 서면 통지로 업데이트될 수 있습니다.' },
    { n: '2', t: '정의', b: '<strong>$OPRN</strong> — Operon 네트워크의 기본 유틸리티 토큰, 고정 총 공급량 42,000,000,000. <strong>노드</strong> — 네트워크 참여 라이선스를 나타내는 ERC-721 또는 BEP-721 NFT. <strong>누적 금액</strong> — 추천 레벨별 가중치가 적용된, 파트너에게 귀속된 노드 구매 누적 달러 금액.' },
    { n: '3', t: '프로그램 등급 및 승급', b: '본 프로그램은 6개 등급으로 구성되며, 누적 금액에 따라 자동 승급됩니다. 연간 등급 기준의 10%를 유지하지 못하는 파트너는 30일 전 서면 통지 후 한 등급 하향될 수 있습니다.' },
    { n: '4', t: '커미션 및 지급', b: 'TGE 전 커미션은 격주 Merkle 루트 게시 후 14일 이내에 ETH 또는 USDC로 지급됩니다. TGE 후 커미션은 추천 및 분배 풀에서 $OPRN으로 지급됩니다. 커미션 비율은 수락 후 제공되는 프로그램 문서에 포함됩니다.' },
    { n: '5', t: '수당 및 마일스톤 보너스', b: '자격 등급의 파트너는 USDC로 격주 지급되는 월간 수당을 받을 수 있으며, 최소 판매 활동 기준을 충족해야 합니다. 누적 금액 기준 달성 시 일회성 마일스톤 보너스가 지급됩니다. 전체 일정은 수락 후 제공됩니다.' },
    { n: '6', t: '파트너 의무', b: '파트너는 노드를 네트워크 참여 라이선스로 설명해야 합니다. 보장된 수익을 전달해서는 안 됩니다. 토큰 관련 내용으로 미국인을 대상으로 해서는 안 됩니다. 프로그램 조건은 기밀입니다. 모든 마케팅 자료는 승인된 브랜드 소재를 사용해야 합니다.' },
    { n: '7', t: '콘텐츠, 데이터 보호 및 기밀 유지', b: '파트너는 프로그램을 위해 제작한 콘텐츠의 소유권을 유지합니다. Operon은 해당 콘텐츠에 대한 영구 라이선스를 부여받습니다. 파트너는 관련 개인정보 보호법에 따라 잠재 고객 데이터를 처리해야 합니다. 모든 프로그램 세부사항은 비활성화 후 2년간 기밀로 유지됩니다.' },
    { n: '8', t: '수정, 비활성화 및 준거법', b: '프로그램 약관은 30일 전 통지로 수정될 수 있습니다. 수수료율표는 14일 전 통지로 수정될 수 있습니다. 사유 있는 비활성화는 캐스케이드 수익을 즉시 종료합니다. 사유 없는 비활성화는 6개월의 전환 기간을 제공합니다. 준거법: 싱가포르 공화국. 분쟁 해결: SIAC 중재.' },
    { n: '9', t: '약관 변경', b: '본 약관(및 인용으로 포함된 수수료율표)은 위에 명시된 사전 통지에 따라 수시로 개정될 수 있습니다. 개정 발효일 이후 프로그램에 계속 참여하는 것은 개정된 약관에 동의하는 것으로 간주됩니다.' },
  ],

  toastCodeCopied: '코드가 복사되었습니다',
  toastLinkCopied: '링크가 복사되었습니다',
  errInviteInvalid: '이 초대 링크는 유효하지 않습니다. 링크를 확인하고 다시 시도하세요.',
  errInviteUsed: '이 초대는 이미 사용되었습니다.',
  errInviteExpired: '이 초대는 만료되었습니다. Operon 담당자에게 문의하세요.',
  errCreateFailed: '파트너 계정을 생성할 수 없습니다. 다시 시도하거나 고객지원에 문의하세요.',
  errSignatureRejected: '서명이 거부되었습니다. 지갑 소유권을 확인하기 위해 다시 시도하세요.',
};

const vi: EppLangPack = {
  pillLabel: 'Tiếng Việt',
  invLabel: 'Chỉ Dành Cho Người Được Mời',
  invExp: 'Lời mời này có hiệu lực cho đến khi được chấp nhận',
  invExpDays: '',
  greeting: 'Kính gửi',
  p1: 'Operon đang chuẩn bị đợt Bán Node Khởi Nguyên — 100.000 giấy phép tham gia mạng lưới, phân bổ trên 40 mức giá. Trước khi mở bán công khai, chúng tôi đang xây dựng một mạng lưới đối tác riêng để đại diện cho dự án.',
  p2: 'Chúng tôi trân trọng mời bạn tham gia Chương Trình Đối Tác Tinh Hoa.',
  p3: 'Với tư cách đối tác, mã giới thiệu của bạn mang lại hai lợi thế riêng biệt. Thứ nhất, người mua của bạn được quyền tham gia đợt bán whitelist — mua ở các mức giá sớm nhất, trước khi mở bán công khai. Thứ hai, mọi giao dịch mua qua mã của bạn đều nhận chiết khấu ưu đãi, áp dụng ở bất kỳ mức giá nào, bất kỳ thời điểm nào trong suốt đợt bán.',
  p4: 'Bạn nhận hoa hồng trên mọi giao dịch được ghi nhận qua nhiều tầng giới thiệu. Chương trình bao gồm cơ chế thăng hạng có cấu trúc, trợ cấp định kỳ khi đạt ngưỡng, thưởng cột mốc, và quyền tham gia nhận thưởng token liên tục sau TGE.',
  sumLabel: 'Tổng Quan Chương Trình',
  sumItems: [
    'Quyền whitelist cho mạng lưới của bạn',
    'Chiết khấu ưu đãi cho người mua',
    'Cấu trúc hoa hồng đa tầng',
    'Trợ cấp hàng tháng ở hạng đủ điều kiện',
    'Thưởng cột mốc',
    'Quyền nhận thưởng sau TGE',
  ],
  sumNote: 'Tài liệu chương trình đầy đủ — bao gồm bảng phí, ngưỡng hạng và cấu trúc hoa hồng — sẽ được cung cấp sau khi bạn chấp nhận.',
  close: 'Trân trọng,',
  sig: 'Đội ngũ Operon',
  btnReview: 'Xem điều khoản chương trình',

  tcEy: 'Điều Khoản Chương Trình',
  tcTitle: 'Điều Khoản & Điều Kiện',
  tcSub: 'Bảng phí đầy đủ được cung cấp sau khi chấp nhận.',
  chk1: 'Tôi chấp nhận Điều Khoản & Điều Kiện Chương Trình Đối Tác Tinh Hoa (v1.0)',
  chk2: 'Tôi xác nhận tôi không phải công dân Hoa Kỳ và không hành động thay mặt công dân Hoa Kỳ',
  chk3: 'Tôi hiểu rằng Operon Node là giấy phép tham gia mạng lưới, không phải chứng khoán hay sản phẩm đầu tư',
  btnAccept: 'Chấp nhận và tiếp tục',
  btnBack: 'Quay lại',

  formEy: 'Thiết Lập Tài Khoản',
  formTitle: 'Thông tin đối tác',
  formSub: 'Kết nối ví của bạn — ví sẽ được dùng cho cả đăng nhập và nhận hoa hồng.',
  labelEmail: 'Địa chỉ email',
  labelChain: 'Chuỗi thanh toán hoa hồng',
  labelWallet: 'Ví đã kết nối',
  labelTg: 'Telegram',
  labelTgOpt: '— không bắt buộc',
  errEmail: 'Vui lòng nhập địa chỉ email hợp lệ',
  hintWallet: 'Hoa hồng sẽ được gửi đến địa chỉ này. Để thay đổi, kết nối lại với ví khác.',
  btnConnect: 'Kết nối ví',
  btnConnected: 'Đã kết nối ví',
  btnCreate: 'Ký và tạo tài khoản đối tác',
  walletPayoutNote: 'Ví bạn kết nối là ví nhận hoa hồng. Để thay đổi sau này, vui lòng liên hệ hỗ trợ.',
  signingMessage: 'Vui lòng ký thông điệp trong ví của bạn để xác nhận.',

  confLabel: 'Tài Khoản Đã Được Tạo',
  confTitle: 'Chào mừng bạn đến với chương trình,',
  codeLabel: 'Mã Giới Thiệu Của Bạn',
  btnCopy: 'Sao chép mã',
  btnLink: 'Sao chép liên kết',
  btnShare: 'Chia sẻ',
  confEmailBefore: 'Tài liệu chương trình sẽ được gửi đến',
  confEmailAfter: '— bao gồm bảng phí đầy đủ, ngưỡng hạng, cấu trúc cột mốc và tài liệu quảng bá.',
  next1: 'Chia sẻ mã giới thiệu để người mua nhận quyền whitelist và chiết khấu ưu đãi',
  next2: 'Xem tài liệu chương trình đã gửi qua email',
  next3: 'Bảng điều khiển đối tác hiện đã sẵn sàng',
  btnDash: 'Mở bảng điều khiển',
  footPayout: 'Thanh toán hoa hồng đến',
  footOn: ', chuỗi:',

  sec: [
    { n: '1', t: 'Chấp Nhận và Phạm Vi', b: 'Hoàn thành quy trình đăng ký này đồng nghĩa với việc bạn chấp nhận toàn bộ các Điều Khoản. Chương trình chỉ dành cho người được mời. Các Điều Khoản này bao gồm Bảng Phí, có thể được cập nhật với thông báo trước 14 ngày bằng văn bản.' },
    { n: '2', t: 'Định Nghĩa', b: '<strong>$OPRN</strong> — token tiện ích gốc của Mạng lưới Operon, tổng cung cố định 42.000.000.000. <strong>Node</strong> — NFT ERC-721 hoặc BEP-721 đại diện cho giấy phép tham gia mạng lưới. <strong>Số Tiền Tích Lũy</strong> — tổng giá trị đô la mua node được ghi nhận cho Đối tác, có trọng số theo tầng giới thiệu.' },
    { n: '3', t: 'Hạng Chương Trình và Thăng Hạng', b: 'Chương trình gồm sáu hạng với thăng hạng tự động dựa trên Số Tiền Tích Lũy. Đối tác không duy trì 10% ngưỡng hạng hàng năm có thể bị hạ một hạng với thông báo trước 30 ngày bằng văn bản.' },
    { n: '4', t: 'Hoa Hồng và Thanh Toán', b: 'Hoa hồng trước TGE được thanh toán bằng ETH hoặc USDC trong vòng 14 ngày sau mỗi đợt công bố Merkle root hai tuần một lần. Hoa hồng sau TGE được thanh toán bằng $OPRN từ Quỹ Giới Thiệu và Phân Phối. Tỷ lệ hoa hồng được cung cấp trong tài liệu chương trình sau khi chấp nhận.' },
    { n: '5', t: 'Trợ Cấp và Thưởng Cột Mốc', b: 'Đối tác ở hạng đủ điều kiện nhận trợ cấp hàng tháng, thanh toán hai tuần một lần bằng USDC, với điều kiện đạt ngưỡng hoạt động bán hàng tối thiểu. Thưởng cột mốc một lần được chi trả khi đạt ngưỡng Số Tiền Tích Lũy. Lịch trình đầy đủ được cung cấp sau khi chấp nhận.' },
    { n: '6', t: 'Nghĩa Vụ Đối Tác', b: 'Đối tác phải mô tả Node là giấy phép tham gia mạng lưới. Không được truyền đạt bất kỳ cam kết lợi nhuận nào. Không được nhắm mục tiêu công dân Hoa Kỳ cho thành phần token. Điều khoản chương trình là thông tin bảo mật. Tất cả tài liệu tiếp thị phải sử dụng tài sản thương hiệu được phê duyệt.' },
    { n: '7', t: 'Nội Dung, Bảo Vệ Dữ Liệu và Bảo Mật', b: 'Đối tác giữ quyền sở hữu nội dung tạo ra cho Chương trình. Operon được cấp giấy phép vĩnh viễn sử dụng nội dung đó. Đối tác phải xử lý dữ liệu khách hàng tiềm năng theo luật bảo mật hiện hành. Mọi chi tiết chương trình được bảo mật trong hai năm sau khi ngừng hoạt động.' },
    { n: '8', t: 'Sửa Đổi, Ngừng Hoạt Động và Luật Áp Dụng', b: 'Điều Khoản Chương Trình có thể được sửa đổi với thông báo trước 30 ngày. Bảng Phí có thể được sửa đổi với thông báo trước 14 ngày. Ngừng hoạt động có lý do sẽ chấm dứt thu nhập liên tầng ngay lập tức. Ngừng hoạt động không có lý do cung cấp giai đoạn chuyển tiếp sáu tháng. Luật áp dụng: Cộng hòa Singapore. Giải quyết tranh chấp: Trọng tài SIAC.' },
    { n: '9', t: 'Thay Đổi Điều Khoản', b: 'Các Điều Khoản này (và Bảng Phí được tham chiếu) có thể được sửa đổi theo thời gian với thông báo trước như nêu trên. Việc tiếp tục tham gia Chương trình sau ngày sửa đổi có hiệu lực được coi là chấp nhận các Điều Khoản đã sửa đổi.' },
  ],

  toastCodeCopied: 'Đã sao chép mã',
  toastLinkCopied: 'Đã sao chép liên kết',
  errInviteInvalid: 'Liên kết lời mời này không hợp lệ. Vui lòng kiểm tra liên kết và thử lại.',
  errInviteUsed: 'Lời mời này đã được sử dụng.',
  errInviteExpired: 'Lời mời này đã hết hạn. Vui lòng liên hệ với người liên lạc của bạn tại Operon.',
  errCreateFailed: 'Chúng tôi không thể tạo tài khoản đối tác của bạn. Vui lòng thử lại hoặc liên hệ hỗ trợ.',
  errSignatureRejected: 'Chữ ký bị từ chối. Vui lòng thử lại để xác nhận quyền sở hữu ví.',
};

// Thai. Written as native prose. Legal sections (T&Cs sec 1–9) use formal
// register; the letter and form copy use polite-but-warm business Thai.
// Note: legal terminology should ideally be reviewed by a Thai legal native
// before use in market.
const th: EppLangPack = {
  pillLabel: 'ไทย',
  invLabel: 'เฉพาะผู้ได้รับเชิญเท่านั้น',
  invExp: 'คำเชิญนี้มีผลจนกว่าจะได้รับการตอบรับ',
  invExpDays: '',
  greeting: 'เรียน',
  p1: 'Operon กำลังเตรียมการขายโหนดรุ่นเริ่มต้น (Genesis Node Sale) — ใบอนุญาตเข้าร่วมเครือข่ายจำนวน 100,000 ใบ แบ่งเป็น 40 ระดับราคา ก่อนเปิดขายสู่สาธารณะ เรากำลังจัดตั้งเครือข่ายพันธมิตรเฉพาะกลุ่มเพื่อเป็นตัวแทนของโครงการ',
  p2: 'เราขอเรียนเชิญท่านเข้าร่วมโครงการพันธมิตรชั้นนำ (Elite Partner Programme)',
  p3: 'ในฐานะพันธมิตร รหัสแนะนำของท่านมอบสิทธิประโยชน์สองประการที่แตกต่างกัน ประการแรก ผู้ซื้อของท่านจะได้รับสิทธิเข้าร่วมการขายในรอบไวต์ลิสต์ — ระดับราคาที่เปิดขายเป็นอันดับแรก ก่อนการเปิดขายสู่สาธารณะ ประการที่สอง การซื้อทุกครั้งผ่านรหัสของท่านจะได้รับส่วนลดพิเศษ ซึ่งใช้ได้ที่ทุกระดับราคา และตลอดช่วงเวลาการขาย',
  p4: 'ท่านจะได้รับค่าคอมมิชชันจากทุกการขายที่ระบุว่ามาจากท่าน ผ่านโครงสร้างการแนะนำหลายระดับ โครงการนี้ครอบคลุมถึงการเลื่อนระดับอย่างเป็นระบบ เงินสนับสนุนรายเดือนเมื่อถึงเกณฑ์ที่กำหนด โบนัสตามจุดสำคัญ (milestone) และสิทธิเข้าร่วมรับรางวัลโทเคนอย่างต่อเนื่องหลัง TGE',
  sumLabel: 'ภาพรวมโครงการ',
  sumItems: [
    'สิทธิเข้าไวต์ลิสต์สำหรับเครือข่ายของท่าน',
    'ส่วนลดพิเศษสำหรับผู้ซื้อ',
    'โครงสร้างค่าคอมมิชชันหลายระดับ',
    'เงินสนับสนุนรายเดือนในระดับที่มีสิทธิ์',
    'โบนัสตามจุดสำคัญ',
    'สิทธิรับรางวัลหลัง TGE',
  ],
  sumNote: 'เอกสารโครงการฉบับสมบูรณ์ — รวมถึงตารางอัตรา เกณฑ์ระดับ และโครงสร้างค่าคอมมิชชัน — จะถูกจัดส่งให้หลังการตอบรับ',
  close: 'ด้วยความเคารพ',
  sig: 'ทีมงาน Operon',
  btnReview: 'อ่านเงื่อนไขโครงการ',

  tcEy: 'เงื่อนไขโครงการ',
  tcTitle: 'ข้อกำหนดและเงื่อนไข',
  tcSub: 'ตารางอัตราฉบับเต็มจะถูกจัดส่งให้หลังการตอบรับ',
  chk1: 'ข้าพเจ้ายอมรับข้อกำหนดและเงื่อนไขของโครงการพันธมิตรชั้นนำ (เวอร์ชัน 1.0)',
  chk2: 'ข้าพเจ้ายืนยันว่าข้าพเจ้ามิใช่บุคคลสัญชาติสหรัฐอเมริกา และมิได้กระทำการแทนบุคคลสัญชาติสหรัฐอเมริกาใดๆ',
  chk3: 'ข้าพเจ้าเข้าใจว่า Operon Node เป็นใบอนุญาตเข้าร่วมเครือข่าย มิใช่หลักทรัพย์หรือผลิตภัณฑ์การลงทุน',
  btnAccept: 'ยอมรับและดำเนินการต่อ',
  btnBack: 'ย้อนกลับ',

  formEy: 'การตั้งค่าบัญชี',
  formTitle: 'ข้อมูลพันธมิตร',
  formSub: 'กรุณาเชื่อมต่อกระเป๋าเงินของท่าน — กระเป๋านี้จะใช้ทั้งสำหรับเข้าสู่ระบบและรับค่าคอมมิชชัน',
  labelEmail: 'ที่อยู่อีเมล',
  labelChain: 'เครือข่ายสำหรับรับค่าคอมมิชชัน',
  labelWallet: 'กระเป๋าเงินที่เชื่อมต่อ',
  labelTg: 'Telegram',
  labelTgOpt: '— ไม่บังคับ',
  errEmail: 'กรุณากรอกที่อยู่อีเมลที่ถูกต้อง',
  hintWallet: 'ค่าคอมมิชชันจะถูกส่งไปยังที่อยู่นี้ หากต้องการเปลี่ยน กรุณาเชื่อมต่อกับกระเป๋าเงินอื่น',
  btnConnect: 'เชื่อมต่อกระเป๋าเงิน',
  btnConnected: 'เชื่อมต่อกระเป๋าเงินแล้ว',
  btnCreate: 'ลงนามและสร้างบัญชีพันธมิตร',
  walletPayoutNote: 'กระเป๋าเงินที่ท่านเชื่อมต่อจะเป็นกระเป๋ารับค่าคอมมิชชัน หากต้องการเปลี่ยนในภายหลัง กรุณาติดต่อฝ่ายสนับสนุน',
  signingMessage: 'กรุณาลงนามข้อความในกระเป๋าเงินของท่านเพื่อยืนยัน',

  confLabel: 'สร้างบัญชีเรียบร้อยแล้ว',
  confTitle: 'ยินดีต้อนรับสู่โครงการ,',
  codeLabel: 'รหัสแนะนำของท่าน',
  btnCopy: 'คัดลอกรหัส',
  btnLink: 'คัดลอกลิงก์',
  btnShare: 'แชร์',
  confEmailBefore: 'เอกสารโครงการจะถูกส่งไปยัง',
  confEmailAfter: '— รวมถึงตารางอัตราฉบับสมบูรณ์ เกณฑ์ระดับ โครงสร้างจุดสำคัญ และทรัพยากรการนำเสนอ',
  next1: 'แชร์รหัสของท่านให้ผู้ซื้อที่สนใจ เพื่อมอบสิทธิเข้าไวต์ลิสต์และส่วนลดพิเศษ',
  next2: 'อ่านเอกสารโครงการที่ส่งไปยังอีเมลของท่าน',
  next3: 'แดชบอร์ดพันธมิตรของท่านพร้อมใช้งานแล้ว',
  btnDash: 'เปิดแดชบอร์ด',
  footPayout: 'ส่งค่าคอมมิชชันไปยัง',
  footOn: 'บนเครือข่าย',

  sec: [
    { n: '1', t: 'การยอมรับและขอบเขต', b: 'การกรอกข้อมูลในขั้นตอนการลงทะเบียนนี้ถือว่าท่านยอมรับข้อกำหนดเหล่านี้โดยสมบูรณ์ โครงการนี้เปิดให้เฉพาะผู้ได้รับเชิญเท่านั้น ข้อกำหนดเหล่านี้ครอบคลุมถึงตารางอัตรา ซึ่งอาจมีการปรับปรุงโดยแจ้งเป็นลายลักษณ์อักษรล่วงหน้า 14 วัน' },
    { n: '2', t: 'คำนิยาม', b: '<strong>$OPRN</strong> — โทเคนสาธารณูปโภคหลักของเครือข่าย Operon มีอุปทานรวมคงที่ 42,000,000,000 หน่วย <strong>โหนด</strong> — NFT มาตรฐาน ERC-721 หรือ BEP-721 ที่แทนใบอนุญาตเข้าร่วมเครือข่าย <strong>มูลค่าสะสม</strong> — มูลค่ารวมเป็นดอลลาร์ของการซื้อโหนดที่ระบุว่ามาจากพันธมิตร โดยถ่วงน้ำหนักตามระดับการแนะนำ' },
    { n: '3', t: 'ระดับและการเลื่อนระดับในโครงการ', b: 'โครงการประกอบด้วย 6 ระดับ พร้อมระบบเลื่อนระดับอัตโนมัติตามมูลค่าสะสม พันธมิตรที่ไม่สามารถรักษาระดับ 10% ของเกณฑ์ระดับของตนรายปีได้ อาจถูกลดระดับลงหนึ่งขั้นโดยแจ้งเป็นลายลักษณ์อักษรล่วงหน้า 30 วัน' },
    { n: '4', t: 'ค่าคอมมิชชันและการชำระเงิน', b: 'ค่าคอมมิชชันก่อน TGE จะชำระเป็น ETH หรือ USDC ภายใน 14 วันหลังการประกาศ Merkle root ทุกสองสัปดาห์ ค่าคอมมิชชันหลัง TGE จะชำระเป็น $OPRN จากกองทุนการแนะนำและการแจกจ่าย อัตราค่าคอมมิชชันจะระบุในเอกสารโครงการที่จัดส่งหลังการตอบรับ' },
    { n: '5', t: 'เงินสนับสนุนและโบนัสจุดสำคัญ', b: 'พันธมิตรในระดับที่มีสิทธิ์จะได้รับเงินสนับสนุนรายเดือน ชำระเป็น USDC ทุกสองสัปดาห์ โดยมีเงื่อนไขเรื่องระดับกิจกรรมการขายขั้นต่ำ โบนัสจุดสำคัญแบบครั้งเดียวจะจ่ายเมื่อบรรลุเกณฑ์มูลค่าสะสมที่กำหนด ตารางฉบับสมบูรณ์จะถูกจัดส่งให้หลังการตอบรับ' },
    { n: '6', t: 'หน้าที่ของพันธมิตร', b: 'พันธมิตรต้องอธิบายโหนดว่าเป็นใบอนุญาตเข้าร่วมเครือข่าย ห้ามสื่อสารถึงผลตอบแทนที่รับประกัน ห้ามเสนอองค์ประกอบโทเคนต่อบุคคลสัญชาติสหรัฐอเมริกา เงื่อนไขโครงการเป็นข้อมูลลับ สื่อการตลาดทั้งหมดต้องใช้แบรนด์ที่ได้รับอนุมัติแล้วเท่านั้น' },
    { n: '7', t: 'เนื้อหา การคุ้มครองข้อมูล และการรักษาความลับ', b: 'พันธมิตรยังคงเป็นเจ้าของเนื้อหาที่สร้างขึ้นเพื่อโครงการ Operon ได้รับสิทธิการใช้งานถาวรสำหรับเนื้อหาดังกล่าว พันธมิตรต้องจัดการข้อมูลของผู้ที่อาจเป็นลูกค้าตามกฎหมายความเป็นส่วนตัวที่เกี่ยวข้อง รายละเอียดทั้งหมดของโครงการจะถือเป็นความลับเป็นเวลาสองปีหลังการยุติการเป็นพันธมิตร' },
    { n: '8', t: 'การแก้ไข การยุติการเป็นพันธมิตร และกฎหมายที่ใช้บังคับ', b: 'ข้อกำหนดของโครงการอาจถูกแก้ไขโดยแจ้งล่วงหน้า 30 วัน ตารางอัตราอาจถูกแก้ไขโดยแจ้งล่วงหน้า 14 วัน การยุติการเป็นพันธมิตรด้วยเหตุอันสมควรจะยุติรายได้แบบเรียงต่อทันที การยุติการเป็นพันธมิตรโดยไม่มีเหตุอันสมควรจะให้ระยะเปลี่ยนผ่านหกเดือน กฎหมายที่ใช้บังคับ: สาธารณรัฐสิงคโปร์ การระงับข้อพิพาท: อนุญาโตตุลาการ SIAC' },
    { n: '9', t: 'การเปลี่ยนแปลงข้อกำหนด', b: 'ข้อกำหนดเหล่านี้ (และตารางอัตราที่อ้างถึง) อาจมีการแก้ไขเป็นครั้งคราวโดยแจ้งล่วงหน้าตามที่ระบุข้างต้น การเข้าร่วมโครงการต่อเนื่องหลังวันที่การแก้ไขมีผลบังคับใช้ ถือเป็นการยอมรับข้อกำหนดที่แก้ไขแล้ว' },
  ],

  toastCodeCopied: 'คัดลอกรหัสแล้ว',
  toastLinkCopied: 'คัดลอกลิงก์แล้ว',
  errInviteInvalid: 'ลิงก์คำเชิญนี้ไม่ถูกต้อง กรุณาตรวจสอบลิงก์และลองใหม่อีกครั้ง',
  errInviteUsed: 'คำเชิญนี้ถูกใช้งานไปแล้ว',
  errInviteExpired: 'คำเชิญนี้หมดอายุแล้ว กรุณาติดต่อผู้ประสานงานของท่านที่ Operon',
  errCreateFailed: 'ไม่สามารถสร้างบัญชีพันธมิตรของท่านได้ กรุณาลองใหม่หรือติดต่อฝ่ายสนับสนุน',
  errSignatureRejected: 'การลงนามถูกปฏิเสธ กรุณาลองใหม่อีกครั้งเพื่อยืนยันความเป็นเจ้าของกระเป๋าเงิน',
};

export const EPP_LANGS: Record<EppLang, EppLangPack> = { en, tc, sc, ko, vi, th };

export const EPP_LANG_LIST: EppLang[] = ['en', 'tc', 'sc', 'ko', 'vi', 'th'];
