// Post-build pass: rewrite per-locale <title>, <meta description>, <link
// rel="canonical">, and inject <link rel="alternate" hreflang="…"> blocks
// across every HTML output (EN root + 6 locale dirs × N pages each).
//
// URL slug uses country codes (cn, tw, kr, jp, th, vn). hreflang values must
// be valid ISO lang codes per Google guidance, so the hreflang attribute uses
// the ISO code (zh-CN, zh-TW, ko, ja, th, vi) but the href uses the slug.

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');

// URL slug → ISO lang for hreflang. 'en' is the root.
const SLUG_TO_ISO = {
  en: 'en',
  cn: 'zh-CN',
  tw: 'zh-TW',
  kr: 'ko',
  jp: 'ja',
  th: 'th',
  vn: 'vi',
};

const SLUGS = Object.keys(SLUG_TO_ISO);
const PAGES = [
  'index.html',
  'agents.html',
  'nodes.html',
  'affiliates.html',
  'faq.html',
];

function metaForPage(page, slug) {
  return META[page]?.[slug];
}
const SITE = 'https://operon.network';

const META = {
  'index.html': {
    en: { title: 'Operon — Open rails for the agent economy',           desc: 'Operon is the open agent protocol — coordination, verification, and distribution for the AI agent economy. 100,000-node network on Arbitrum and BNB Smart Chain.' },
    cn: { title: 'Operon — AI 智能体经济的开放轨道',                          desc: 'Operon 是开放智能体协议——为 AI 智能体经济提供协调、验证与分发。Arbitrum 与 BNB 智能链上的 10 万节点网络。' },
    tw: { title: 'Operon — AI 智能體經濟的開放軌道',                          desc: 'Operon 是開放智能體協議——為 AI 智能體經濟提供協調、驗證與分發。Arbitrum 與 BNB 智能鏈上的 10 萬節點網絡。' },
    kr: { title: 'Operon — AI 에이전트 경제의 오픈 레일',                       desc: 'Operon은 AI 에이전트 경제를 위한 오픈 에이전트 프로토콜로 코디네이션, 검증, 배포를 제공합니다. Arbitrum과 BNB 스마트 체인의 10만 노드 네트워크.' },
    jp: { title: 'Operon — エージェント経済のためのオープンレール',                 desc: 'Operon は AI エージェント経済のためのオープンエージェントプロトコルで、調整・検証・分配を提供します。Arbitrum と BNB スマートチェーンの 10 万ノードネットワーク。' },
    th: { title: 'Operon — รางเปิดสำหรับเศรษฐกิจ AI Agent',                desc: 'Operon คือโปรโตคอลเอเจนต์แบบเปิด ให้การประสานงาน การตรวจสอบ และการกระจายสำหรับเศรษฐกิจ AI agent เครือข่าย 100,000 โหนดบน Arbitrum และ BNB Smart Chain' },
    vn: { title: 'Operon — Đường ray mở cho nền kinh tế AI agent',         desc: 'Operon là giao thức agent mở — phối hợp, xác minh và phân phối cho nền kinh tế AI agent. Mạng 100.000 node trên Arbitrum và BNB Smart Chain.' },
  },
  'agents.html': {
    en: { title: 'Agents | Operon',                                       desc: 'AI agents on Operon coordinate, verify, and reach users through the open agent protocol. Browse showcase agents and integrations.' },
    cn: { title: '智能体 | Operon',                                       desc: 'Operon 上的 AI 智能体通过开放智能体协议进行协调、验证并触达用户。浏览展示智能体与集成。' },
    tw: { title: '智能體 | Operon',                                       desc: 'Operon 上的 AI 智能體透過開放智能體協議進行協調、驗證並觸達用戶。瀏覽展示智能體與整合。' },
    kr: { title: '에이전트 | Operon',                                        desc: 'Operon의 AI 에이전트는 오픈 에이전트 프로토콜을 통해 코디네이션, 검증, 사용자 도달을 수행합니다.' },
    jp: { title: 'エージェント | Operon',                                      desc: 'Operon の AI エージェントは、オープンエージェントプロトコルを通じて調整・検証・ユーザー到達を行います。' },
    th: { title: 'เอเจนต์ | Operon',                                       desc: 'AI agents บน Operon ประสานงาน ตรวจสอบ และเข้าถึงผู้ใช้ผ่านโปรโตคอลเอเจนต์แบบเปิด' },
    vn: { title: 'Agents | Operon',                                       desc: 'AI agents trên Operon phối hợp, xác minh và tiếp cận người dùng thông qua giao thức agent mở.' },
  },
  'nodes.html': {
    en: { title: 'Nodes | Operon',                                        desc: 'Run an Operon node — earn from coordinating, verifying, and serving the AI agent economy. 100,000 ERC-721 licences across Arbitrum and BNB.' },
    cn: { title: '节点 | Operon',                                         desc: '运行 Operon 节点——通过协调、验证与服务 AI 智能体经济获得回报。Arbitrum 与 BNB 上的 10 万 ERC-721 许可证。' },
    tw: { title: '節點 | Operon',                                         desc: '運行 Operon 節點——透過協調、驗證與服務 AI 智能體經濟獲得回報。Arbitrum 與 BNB 上的 10 萬 ERC-721 許可證。' },
    kr: { title: '노드 | Operon',                                           desc: 'Operon 노드를 실행하고 AI 에이전트 경제의 코디네이션, 검증, 서빙으로 수익을 얻으세요. Arbitrum과 BNB의 10만 ERC-721 라이선스.' },
    jp: { title: 'ノード | Operon',                                          desc: 'Operon ノードを稼働し、AI エージェント経済の調整・検証・サービング で収益を得ます。Arbitrum と BNB の 10 万 ERC-721 ライセンス。' },
    th: { title: 'โหนด | Operon',                                          desc: 'รัน Operon node — รับรายได้จากการประสานงาน ตรวจสอบ และให้บริการเศรษฐกิจ AI agent ใบอนุญาต ERC-721 จำนวน 100,000 ใบบน Arbitrum และ BNB' },
    vn: { title: 'Node | Operon',                                          desc: 'Chạy node Operon — kiếm thu nhập từ phối hợp, xác minh và phục vụ nền kinh tế AI agent. 100.000 giấy phép ERC-721 trên Arbitrum và BNB.' },
  },
  'affiliates.html': {
    en: { title: 'Affiliates | Operon',                                   desc: 'Earn rewards by referring buyers to the Operon node sale. Standard referrals plus an Elite Partner programme for high-volume distributors.' },
    cn: { title: '推广合作 | Operon',                                       desc: '推荐买家参与 Operon 节点销售并获得奖励。标准推广计划与面向高额分销商的精英合伙人计划。' },
    tw: { title: '推廣合作 | Operon',                                       desc: '推薦買家參與 Operon 節點銷售並獲得獎勵。標準推廣計畫與面向高額分銷商的菁英合夥人計畫。' },
    kr: { title: '제휴 프로그램 | Operon',                                     desc: 'Operon 노드 판매에 구매자를 추천하고 보상을 받으세요. 표준 리퍼럴과 대규모 파트너를 위한 엘리트 파트너 프로그램.' },
    jp: { title: 'アフィリエイト | Operon',                                     desc: 'Operon ノード販売に買い手を紹介して報酬を獲得。標準リファラルと大型パートナー向けエリートパートナープログラム。' },
    th: { title: 'พันธมิตร | Operon',                                       desc: 'แนะนำผู้ซื้อเข้าร่วมการขายโหนด Operon และรับรางวัล โปรแกรมแนะนำมาตรฐานและ Elite Partner สำหรับพันธมิตรระดับสูง' },
    vn: { title: 'Đối tác | Operon',                                        desc: 'Giới thiệu người mua tham gia bán node Operon và nhận thưởng. Chương trình giới thiệu tiêu chuẩn và Elite Partner cho đối tác lớn.' },
  },
  'faq.html': {
    en: { title: 'FAQ | Operon',                                          desc: 'Frequently asked questions about Operon — node sale, technical requirements, rewards, governance, and more.' },
    cn: { title: '常见问题 | Operon',                                       desc: '关于 Operon 的常见问题——节点销售、技术要求、奖励、治理等。' },
    tw: { title: '常見問題 | Operon',                                       desc: '關於 Operon 的常見問題——節點銷售、技術要求、獎勵、治理等。' },
    kr: { title: 'FAQ | Operon',                                          desc: 'Operon에 대한 자주 묻는 질문 — 노드 판매, 기술 요구사항, 보상, 거버넌스 등.' },
    jp: { title: 'よくある質問 | Operon',                                      desc: 'Operon に関するよくある質問——ノード販売、技術要件、報酬、ガバナンスなど。' },
    th: { title: 'คำถามพบบ่อย | Operon',                                   desc: 'คำถามที่พบบ่อยเกี่ยวกับ Operon — การขายโหนด ข้อกำหนดทางเทคนิค รางวัล การกำกับดูแล และอื่น ๆ' },
    vn: { title: 'Câu hỏi thường gặp | Operon',                            desc: 'Các câu hỏi thường gặp về Operon — bán node, yêu cầu kỹ thuật, phần thưởng, quản trị, và hơn thế nữa.' },
  },
};

function urlFor(slug, page) {
  if (page === 'index.html') {
    return slug === 'en' ? `${SITE}/` : `${SITE}/${slug}/`;
  }
  // Drop .html for canonical / hreflang URLs — nginx try_files resolves
  // bare slugs to .html, and bare slugs are the canonical user-facing form.
  const slug2 = page.replace(/\.html$/, '');
  return slug === 'en' ? `${SITE}/${slug2}` : `${SITE}/${slug}/${slug2}`;
}

function buildHreflangs(page) {
  const lines = SLUGS.map(
    (slug) => `<link rel="alternate" hreflang="${SLUG_TO_ISO[slug]}" href="${urlFor(slug, page)}" />`
  );
  lines.push(`<link rel="alternate" hreflang="x-default" href="${urlFor('en', page)}" />`);
  return lines.join('\n');
}

async function processFile(absPath, slug, page) {
  let html = await fs.readFile(absPath, 'utf8');
  const meta = metaForPage(page, slug);
  if (!meta) {
    console.warn(`  ! no meta entry for (${page}, ${slug}) — skipping`);
    return;
  }
  const canonical = urlFor(slug, page);
  const hreflangs = buildHreflangs(page);

  html = html.replace(
    /<title[^>]*>[^<]*<\/title>/i,
    `<title>${meta.title}</title>`
  );

  const descMatch = html.match(/<meta\s+name=["']description["'][^>]*>/i);
  if (descMatch) {
    html = html.replace(
      descMatch[0],
      `<meta name="description" content="${meta.desc.replace(/"/g, '&quot;')}">`
    );
  } else {
    html = html.replace(
      /<link\s+rel=["']canonical["'][^>]*>/i,
      (m) => `<meta name="description" content="${meta.desc.replace(/"/g, '&quot;')}">\n${m}`
    );
  }

  html = html.replace(
    /<link\s+rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${canonical}" />`
  );

  html = html.replace(
    /\n?<link rel="alternate" hreflang="[^"]+" href="[^"]+" \/>/g,
    ''
  );

  html = html.replace(
    /<link rel="canonical"[^>]*>/i,
    (m) => `${m}\n${hreflangs}`
  );

  await fs.writeFile(absPath, html, 'utf8');
}

async function main() {
  let touched = 0;
  for (const slug of SLUGS) {
    for (const page of PAGES) {
      const dir = slug === 'en' ? root : path.join(root, slug);
      const file = path.join(dir, page);
      try {
        await fs.access(file);
      } catch {
        continue;
      }
      console.log(`updating ${path.relative(root, file)}`);
      await processFile(file, slug, page);
      touched++;
    }
  }
  console.log(`\ntotal ${touched} files updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
