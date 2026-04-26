// One-shot: rewrite per-locale <title>, <meta description>, <link
// rel="canonical">, and inject <link rel="alternate" hreflang="…">
// blocks across every prototype-O HTML file (EN root + 6 locale dirs ×
// 4 pages each).
//
// Pre-state:
//   - Localised pages had `<link rel="canonical" href="https://operon.network/">`
//     pointing back at the EN root, which tells Google to deindex the
//     locale URLs.
//   - <title> and <meta name="description"> were identical English
//     strings in every locale.
//   - No hreflang alternates anywhere.
//
// Post-state:
//   - canonical points at the page's own URL.
//   - hreflang alternates exist for all 7 locales + x-default.
//   - title/meta are localised per (lang, page).

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');

const SUPPORTED = ['en', 'zh-cn', 'zh-tw', 'ko', 'ja', 'th', 'vi'];
const PAGES = [
  'hero-prototype-O.html',
  'hero-prototype-O-agents.html',
  'hero-prototype-O-nodes.html',
  'hero-prototype-O-faq.html',
];
const SITE = 'https://operon.network';

// Localised title + meta per (page, lang). Kept short — search engines
// truncate at ~60 chars for title and ~160 for description.
const META = {
  'hero-prototype-O.html': {
    en:    { title: 'Operon — Open rails for the agent economy',           desc: 'Operon is the open agent protocol — coordination, verification, and distribution for the AI agent economy. 100,000-node network on Arbitrum and BNB Smart Chain.' },
    'zh-cn': { title: 'Operon — AI 智能体经济的开放轨道',                          desc: 'Operon 是开放智能体协议——为 AI 智能体经济提供协调、验证与分发。Arbitrum 与 BNB 智能链上的 10 万节点网络。' },
    'zh-tw': { title: 'Operon — AI 智能體經濟的開放軌道',                          desc: 'Operon 是開放智能體協議——為 AI 智能體經濟提供協調、驗證與分發。Arbitrum 與 BNB 智能鏈上的 10 萬節點網絡。' },
    ko:    { title: 'Operon — AI 에이전트 경제의 오픈 레일',                       desc: 'Operon은 AI 에이전트 경제를 위한 오픈 에이전트 프로토콜로 코디네이션, 검증, 배포를 제공합니다. Arbitrum과 BNB 스마트 체인의 10만 노드 네트워크.' },
    ja:    { title: 'Operon — エージェント経済のためのオープンレール',                 desc: 'Operon は AI エージェント経済のためのオープンエージェントプロトコルで、調整・検証・分配を提供します。Arbitrum と BNB スマートチェーンの 10 万ノードネットワーク。' },
    th:    { title: 'Operon — รางเปิดสำหรับเศรษฐกิจ AI Agent',                desc: 'Operon คือโปรโตคอลเอเจนต์แบบเปิด ให้การประสานงาน การตรวจสอบ และการกระจายสำหรับเศรษฐกิจ AI agent เครือข่าย 100,000 โหนดบน Arbitrum และ BNB Smart Chain' },
    vi:    { title: 'Operon — Đường ray mở cho nền kinh tế AI agent',         desc: 'Operon là giao thức agent mở — phối hợp, xác minh và phân phối cho nền kinh tế AI agent. Mạng 100.000 node trên Arbitrum và BNB Smart Chain.' },
  },
  'hero-prototype-O-agents.html': {
    en:    { title: 'Agents | Operon',                                       desc: 'AI agents on Operon coordinate, verify, and reach users through the open agent protocol. Browse showcase agents and integrations.' },
    'zh-cn': { title: '智能体 | Operon',                                       desc: 'Operon 上的 AI 智能体通过开放智能体协议进行协调、验证并触达用户。浏览展示智能体与集成。' },
    'zh-tw': { title: '智能體 | Operon',                                       desc: 'Operon 上的 AI 智能體透過開放智能體協議進行協調、驗證並觸達用戶。瀏覽展示智能體與整合。' },
    ko:    { title: '에이전트 | Operon',                                        desc: 'Operon의 AI 에이전트는 오픈 에이전트 프로토콜을 통해 코디네이션, 검증, 사용자 도달을 수행합니다.' },
    ja:    { title: 'エージェント | Operon',                                      desc: 'Operon の AI エージェントは、オープンエージェントプロトコルを通じて調整・検証・ユーザー到達を行います。' },
    th:    { title: 'เอเจนต์ | Operon',                                       desc: 'AI agents บน Operon ประสานงาน ตรวจสอบ และเข้าถึงผู้ใช้ผ่านโปรโตคอลเอเจนต์แบบเปิด' },
    vi:    { title: 'Agents | Operon',                                       desc: 'AI agents trên Operon phối hợp, xác minh và tiếp cận người dùng thông qua giao thức agent mở.' },
  },
  'hero-prototype-O-nodes.html': {
    en:    { title: 'Nodes | Operon',                                        desc: 'Run an Operon node — earn from coordinating, verifying, and serving the AI agent economy. 100,000 ERC-721 licences across Arbitrum and BNB.' },
    'zh-cn': { title: '节点 | Operon',                                         desc: '运行 Operon 节点——通过协调、验证与服务 AI 智能体经济获得回报。Arbitrum 与 BNB 上的 10 万 ERC-721 许可证。' },
    'zh-tw': { title: '節點 | Operon',                                         desc: '運行 Operon 節點——透過協調、驗證與服務 AI 智能體經濟獲得回報。Arbitrum 與 BNB 上的 10 萬 ERC-721 許可證。' },
    ko:    { title: '노드 | Operon',                                           desc: 'Operon 노드를 실행하고 AI 에이전트 경제의 코디네이션, 검증, 서빙으로 수익을 얻으세요. Arbitrum과 BNB의 10만 ERC-721 라이선스.' },
    ja:    { title: 'ノード | Operon',                                          desc: 'Operon ノードを稼働し、AI エージェント経済の調整・検証・サービング で収益を得ます。Arbitrum と BNB の 10 万 ERC-721 ライセンス。' },
    th:    { title: 'โหนด | Operon',                                          desc: 'รัน Operon node — รับรายได้จากการประสานงาน ตรวจสอบ และให้บริการเศรษฐกิจ AI agent ใบอนุญาต ERC-721 จำนวน 100,000 ใบบน Arbitrum และ BNB' },
    vi:    { title: 'Node | Operon',                                          desc: 'Chạy node Operon — kiếm thu nhập từ phối hợp, xác minh và phục vụ nền kinh tế AI agent. 100.000 giấy phép ERC-721 trên Arbitrum và BNB.' },
  },
  'hero-prototype-O-faq.html': {
    en:    { title: 'FAQ | Operon',                                          desc: 'Frequently asked questions about Operon — node sale, technical requirements, rewards, governance, and more.' },
    'zh-cn': { title: '常见问题 | Operon',                                       desc: '关于 Operon 的常见问题——节点销售、技术要求、奖励、治理等。' },
    'zh-tw': { title: '常見問題 | Operon',                                       desc: '關於 Operon 的常見問題——節點銷售、技術要求、獎勵、治理等。' },
    ko:    { title: 'FAQ | Operon',                                          desc: 'Operon에 대한 자주 묻는 질문 — 노드 판매, 기술 요구사항, 보상, 거버넌스 등.' },
    ja:    { title: 'よくある質問 | Operon',                                      desc: 'Operon に関するよくある質問——ノード販売、技術要件、報酬、ガバナンスなど。' },
    th:    { title: 'คำถามพบบ่อย | Operon',                                   desc: 'คำถามที่พบบ่อยเกี่ยวกับ Operon — การขายโหนด ข้อกำหนดทางเทคนิค รางวัล การกำกับดูแล และอื่น ๆ' },
    vi:    { title: 'Câu hỏi thường gặp | Operon',                            desc: 'Các câu hỏi thường gặp về Operon — bán node, yêu cầu kỹ thuật, phần thưởng, quản trị, và hơn thế nữa.' },
  },
};

function urlFor(lang, page) {
  return lang === 'en' ? `${SITE}/${page}` : `${SITE}/${lang}/${page}`;
}

function buildHreflangs(page) {
  const lines = SUPPORTED.map(
    (lang) => `<link rel="alternate" hreflang="${lang}" href="${urlFor(lang, page)}" />`
  );
  lines.push(`<link rel="alternate" hreflang="x-default" href="${urlFor('en', page)}" />`);
  return lines.join('\n');
}

async function processFile(absPath, lang, page) {
  let html = await fs.readFile(absPath, 'utf8');
  const meta = META[page]?.[lang];
  if (!meta) {
    console.warn(`  ! no meta entry for (${page}, ${lang}) — skipping`);
    return;
  }
  const canonical = urlFor(lang, page);
  const hreflangs = buildHreflangs(page);

  // Replace <title>...</title> (single-line). Allow attributes.
  html = html.replace(
    /<title[^>]*>[^<]*<\/title>/i,
    `<title>${meta.title}</title>`
  );

  // Replace <meta name="description" content="...">. Allow either quote
  // style and any attribute order.
  const descMatch = html.match(/<meta\s+name=["']description["'][^>]*>/i);
  if (descMatch) {
    html = html.replace(
      descMatch[0],
      `<meta name="description" content="${meta.desc.replace(/"/g, '&quot;')}">`
    );
  } else {
    // Insert before the existing canonical if no description present.
    html = html.replace(
      /<link\s+rel=["']canonical["'][^>]*>/i,
      (m) => `<meta name="description" content="${meta.desc.replace(/"/g, '&quot;')}">\n${m}`
    );
  }

  // Replace canonical href.
  html = html.replace(
    /<link\s+rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${canonical}" />`
  );

  // Strip any old hreflang block we may have written previously (idempotent run).
  html = html.replace(
    /\n?<link rel="alternate" hreflang="[^"]+" href="[^"]+" \/>/g,
    ''
  );

  // Inject the new hreflang block after canonical.
  html = html.replace(
    /<link rel="canonical"[^>]*>/i,
    (m) => `${m}\n${hreflangs}`
  );

  await fs.writeFile(absPath, html, 'utf8');
}

async function main() {
  let touched = 0;
  for (const lang of SUPPORTED) {
    for (const page of PAGES) {
      const dir = lang === 'en' ? root : path.join(root, lang);
      const file = path.join(dir, page);
      try {
        await fs.access(file);
      } catch {
        continue; // file doesn't exist for this combo
      }
      console.log(`updating ${path.relative(root, file)}`);
      await processFile(file, lang, page);
      touched++;
    }
  }
  console.log(`\ntotal ${touched} files updated.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
