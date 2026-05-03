// One-shot helper: add i18n entries for newly tagged strings (nav links,
// JS-driven demo strings) across en.json + 6 lang dicts. Idempotent.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const I18N_DIR = join(__dirname, '..', 'i18n');

// Per-key translations across all 7 dicts. en is the source of truth.
const ENTRIES = {
  // Top nav links — home page
  'home.nav.link_home':                  { en: 'Operon',  cn: 'Operon', tw: 'Operon', kr: 'Operon', jp: 'Operon', th: 'Operon', vn: 'Operon' },
  'home.nav.link_agents':                { en: 'Agents',  cn: '智能体',   tw: '智能體',   kr: '에이전트',   jp: 'エージェント', th: 'Agents', vn: 'Agent' },
  'home.nav.link_nodes':                 { en: 'Nodes',   cn: '节点',     tw: '節點',     kr: '노드',     jp: 'ノード',     th: 'Nodes',  vn: 'Node' },
  'home.nav.link_affiliates':            { en: 'Affiliates', cn: '推广',  tw: '推廣',     kr: '제휴',     jp: 'アフィリエイト', th: 'พันธมิตร', vn: 'Đối tác' },
  'home.nav.link_faq':                   { en: 'FAQ',     cn: 'FAQ',     tw: 'FAQ',     kr: 'FAQ',     jp: 'FAQ',       th: 'FAQ',    vn: 'FAQ' },

  // Top nav links — agents page
  'agents.nav.link_home':                { en: 'Operon',  cn: 'Operon', tw: 'Operon', kr: 'Operon', jp: 'Operon', th: 'Operon', vn: 'Operon' },
  'agents.nav.link_agents':              { en: 'Agents',  cn: '智能体',   tw: '智能體',   kr: '에이전트',   jp: 'エージェント', th: 'Agents', vn: 'Agent' },
  'agents.nav.link_nodes':               { en: 'Nodes',   cn: '节点',     tw: '節點',     kr: '노드',     jp: 'ノード',     th: 'Nodes',  vn: 'Node' },
  'agents.nav.link_affiliates':          { en: 'Affiliates', cn: '推广',  tw: '推廣',     kr: '제휴',     jp: 'アフィリエイト', th: 'พันธมิตร', vn: 'Đối tác' },
  'agents.nav.link_faq':                 { en: 'FAQ',     cn: 'FAQ',     tw: 'FAQ',     kr: 'FAQ',     jp: 'FAQ',       th: 'FAQ',    vn: 'FAQ' },

  // Top nav links — nodes page
  'nodes.nav.link_home':                 { en: 'Operon',  cn: 'Operon', tw: 'Operon', kr: 'Operon', jp: 'Operon', th: 'Operon', vn: 'Operon' },
  'nodes.nav.link_agents':               { en: 'Agents',  cn: '智能体',   tw: '智能體',   kr: '에이전트',   jp: 'エージェント', th: 'Agents', vn: 'Agent' },
  'nodes.nav.link_nodes':                { en: 'Nodes',   cn: '节点',     tw: '節點',     kr: '노드',     jp: 'ノード',     th: 'Nodes',  vn: 'Node' },
  'nodes.nav.link_affiliates':           { en: 'Affiliates', cn: '推广',  tw: '推廣',     kr: '제휴',     jp: 'アフィリエイト', th: 'พันธมิตร', vn: 'Đối tác' },
  'nodes.nav.link_faq':                  { en: 'FAQ',     cn: 'FAQ',     tw: 'FAQ',     kr: 'FAQ',     jp: 'FAQ',       th: 'FAQ',    vn: 'FAQ' },

  // Top nav links — affiliates page (and CTA + status pill)
  'affiliates.nav.link_home':            { en: 'Operon',  cn: 'Operon', tw: 'Operon', kr: 'Operon', jp: 'Operon', th: 'Operon', vn: 'Operon' },
  'affiliates.nav.link_agents':          { en: 'Agents',  cn: '智能体',   tw: '智能體',   kr: '에이전트',   jp: 'エージェント', th: 'Agents', vn: 'Agent' },
  'affiliates.nav.link_nodes':           { en: 'Nodes',   cn: '节点',     tw: '節點',     kr: '노드',     jp: 'ノード',     th: 'Nodes',  vn: 'Node' },
  'affiliates.nav.link_affiliates':      { en: 'Affiliates', cn: '推广',  tw: '推廣',     kr: '제휴',     jp: 'アフィリエイト', th: 'พันธมิตร', vn: 'Đối tác' },
  'affiliates.nav.link_faq':             { en: 'FAQ',     cn: 'FAQ',     tw: 'FAQ',     kr: 'FAQ',     jp: 'FAQ',       th: 'FAQ',    vn: 'FAQ' },
  'affiliates.nav.cta':                  { en: 'Launch App<span class="arr">↗</span>', cn: '启动应用<span class="arr">↗</span>', tw: '啟動應用<span class="arr">↗</span>', kr: '앱 실행<span class="arr">↗</span>', jp: 'アプリを起動<span class="arr">↗</span>', th: 'เปิดแอป<span class="arr">↗</span>', vn: 'Mở ứng dụng<span class="arr">↗</span>' },
  'affiliates.nav.status_label':         { en: 'Status:', cn: '状态:',   tw: '狀態:',   kr: '상태:',   jp: 'ステータス:', th: 'สถานะ:', vn: 'Trạng thái:' },
  'affiliates.nav.status_value':         { en: 'Live',    cn: '已上线',   tw: '已上線',   kr: '운영 중',   jp: '稼働中',   th: 'ใช้งานได้', vn: 'Đã hoạt động' },

  // Verify-demo dynamic strings — home page
  'home.demo.drafting':                  { en: 'drafting',                                  cn: '撰写中',                                tw: '撰寫中',                                kr: '작성 중',                              jp: '作成中',                                  th: 'กำลังร่าง',                            vn: 'đang soạn' },
  'home.demo.attested':                  { en: '✓ attested',                                cn: '✓ 已认证',                              tw: '✓ 已認證',                              kr: '✓ 검증됨',                             jp: '✓ 検証済',                                th: '✓ ตรวจสอบแล้ว',                       vn: '✓ đã xác minh' },
  'home.demo.attested_prefix':           { en: 'Independently attested · workflow.run.',     cn: '独立认证 · workflow.run.',                tw: '獨立認證 · workflow.run.',                kr: '독립 검증 · workflow.run.',              jp: '独立検証済 · workflow.run.',                th: 'ตรวจสอบอิสระ · workflow.run.',           vn: 'Xác minh độc lập · workflow.run.' },
  'home.demo.attestations_suffix':       { en: 'attestations',                              cn: '项认证',                                tw: '項認證',                                kr: '검증',                                jp: '件の検証',                                th: 'การตรวจสอบ',                          vn: 'xác minh' },

  // Reward-card dynamic time-ago — home page
  'home.reward.just_now':                { en: 'just now',                                  cn: '刚刚',                                  tw: '剛剛',                                  kr: '방금',                                jp: 'たった今',                                th: 'เมื่อสักครู่',                           vn: 'vừa xong' },

  // Verify-demo dynamic strings — agents page
  'agents.demo.drafting':                { en: 'drafting',                                  cn: '撰写中',                                tw: '撰寫中',                                kr: '작성 중',                              jp: '作成中',                                  th: 'กำลังร่าง',                            vn: 'đang soạn' },
  'agents.demo.attested':                { en: '✓ attested',                                cn: '✓ 已认证',                              tw: '✓ 已認證',                              kr: '✓ 검증됨',                             jp: '✓ 検証済',                                th: '✓ ตรวจสอบแล้ว',                       vn: '✓ đã xác minh' },
  'agents.demo.attested_prefix':         { en: 'Independently attested · workflow.run.',     cn: '独立认证 · workflow.run.',                tw: '獨立認證 · workflow.run.',                kr: '독립 검증 · workflow.run.',              jp: '独立検証済 · workflow.run.',                th: 'ตรวจสอบอิสระ · workflow.run.',           vn: 'Xác minh độc lập · workflow.run.' },
  'agents.demo.attestations_suffix':     { en: 'attestations',                              cn: '项认证',                                tw: '項認證',                                kr: '검증',                                jp: '件の検証',                                th: 'การตรวจสอบ',                          vn: 'xác minh' },

  // Reward-card dynamic time-ago — nodes page
  'nodes.reward.just_now':               { en: 'just now',                                  cn: '刚刚',                                  tw: '剛剛',                                  kr: '방금',                                jp: 'たった今',                                th: 'เมื่อสักครู่',                           vn: 'vừa xong' },

  // Reward-card initial static delta — nodes page
  'nodes.reward.delta_initial':          { en: '+0.3 today',                                cn: '+0.3 今天',                              tw: '+0.3 今天',                              kr: '+0.3 오늘',                            jp: '+0.3 今日',                                th: '+0.3 วันนี้',                           vn: '+0.3 hôm nay' },

  // Coming-soon swap label — applied to any link to app.operon.network
  'common.coming_soon':                  { en: 'Coming soon',                               cn: '即将推出',                              tw: '即將推出',                              kr: '출시 예정',                            jp: '近日公開',                                th: 'เร็ว ๆ นี้',                           vn: 'Sắp ra mắt' },
};

const SLUGS = ['en', 'cn', 'tw', 'kr', 'jp', 'th', 'vn'];

for (const slug of SLUGS) {
  const path = join(I18N_DIR, `${slug}.json`);
  if (!existsSync(path)) {
    console.warn(`SKIP ${path} (missing)`);
    continue;
  }
  const dict = JSON.parse(readFileSync(path, 'utf8'));
  let added = 0;
  for (const [key, vals] of Object.entries(ENTRIES)) {
    if (!(key in dict)) {
      dict[key] = vals[slug];
      added++;
    }
  }
  if (added > 0) {
    writeFileSync(path, JSON.stringify(dict, null, 2) + '\n', 'utf8');
  }
  console.log(`[${slug}] +${added} key(s)`);
}
