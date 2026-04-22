# TESTING_GUIDE.md — Operon 第一阶段(第 2 轮)

**适用对象：** 在 Operon 正式上线之前,帮助我们做测试的任何人。你需要一台电脑、一个浏览器,以及大约半天的时间(约 2 小时用来搭建环境,再 1–2 小时点按测试步骤)。

**要做什么：** 在自己的电脑上部署 Operon 应用,在两条测试链(Arbitrum Sepolia 与 BSC Testnet)上配置加密钱包,然后测试关键的资金路径：购买节点、使用推荐链接、查看折扣,并确认佣金进入正确的钱包。其他所有内容都已经有自动化测试覆盖,你只测试那些需要真人用眼睛和钱包才能验证的部分。

**为什么这很重要：** 正式上线后,用户会在两条不同的区块链上用真钱付款。上线当天出现静默故障——佣金算错、提前显示"Successful"、折扣消失——事后几乎无法补救。你的任务是现在就把这些东西弄坏。

**和第 1 轮有什么不同：** 这是第二轮用户测试。第一轮(2026-04-14)暴露出 14 个 bug,全部已经修复,代码也经过了端到端复审,本次交付反映的就是修复后的状态。Part 3 的搭建步骤里有两项是新的——**即便你参加过第 1 轮,也请仔细读完 Part 3**。本指南末尾的 Part 10 列出了已知的遗留事项——这些是有意推迟到以后处理的项目,不是希望你上报的 bug。Part 7 是新增内容,整理了那些"看起来像 bug 其实不是"的常见情况——**在上报问题之前,请先看一下 Part 7**。

**你不需要看懂代码。** 你只需要复制粘贴命令。如果哪一步失败,把错误信息发给操作人员——不要自作主张。

---

## Part 0 — 这份资料包里有什么

本文件旁边的 `operon-dashboard/` 文件夹就是完整的应用代码。你**不**需要 `git clone` 任何东西——如果其他文档里提到 git clone,请跳过那一步。

---

## Part 1 — 安装所需工具

一共五样东西。已经装好的可以跳过。

### 1.1 Node.js(版本 22 LTS 或更新)

1. 打开 **nodejs.org** → 下载 **LTS** 版本 → 安装。
2. 打开终端并验证：
   ```
   node --version
   ```
   在 Windows 上请使用 **Git Bash**(会在 1.3 步随 Git 一起装好)。不要用 PowerShell,也不要用 CMD——本指南里很多命令在它们里面无法执行。

### 1.2 pnpm

```
npm install -g pnpm
```
验证：`pnpm --version` 应当显示 9 或更高。

### 1.3 Git(以及 Windows 上的 Git Bash)

从 **git-scm.com/downloads** 下载。Windows 安装程序会同时把 **Git Bash** 加到开始菜单——本指南里的每条命令都在 Git Bash 里执行。

### 1.4 MetaMask 浏览器扩展

1. 打开 **metamask.io** → Download → 安装。
2. 把扩展固定到浏览器工具栏(拼图图标 → pin)。
3. 创建一个新钱包。把 12 个单词的助记词抄在纸上。设置密码。

### 1.5 代码编辑器(可选)

你需要编辑一个配置文件。任何编辑器都可以。没有的话去 **code.visualstudio.com** 下载 **VS Code**。

---

## Part 2 — 配置你的钱包

你需要在 MetaMask 里有**三个钱包**：

- **Deployer** — 用来部署智能合约,同时也是你的管理员钱包。
- **Wallet A** — 推荐链的顶层。
- **Wallet B** — 由 Wallet A 推荐。

### 2.1 创建三个 MetaMask 账户

点击 MetaMask 图标 → 右上角的头像 → **Add a new account** → 命名为 **Deployer**。再重复两次,分别命名为 **Wallet A** 和 **Wallet B**。

> ⚠️ **重要使用提示(第 2 轮新增)：** 本应用要求你在切换钱包之前先退出登录。**想从 Wallet A 切到 Wallet B 时,先在应用内(或页面右上角的钱包图标)点击 Disconnect,然后再在 MetaMask 里切换账户。** 如果你在应用仍然显示上一个钱包登录状态时直接切换 MetaMask 账户,应用会检测到账户变化并强制你重新签名——这是正确的安全行为,但可能让你觉得突兀。先 Disconnect 是更顺畅的做法。

### 2.2 在 MetaMask 里添加 Arbitrum Sepolia

网络下拉菜单 → **Add a custom network**：

- **Name:** Arbitrum Sepolia
- **RPC URL:** `https://sepolia-rollup.arbitrum.io/rpc`
- **Chain ID:** `421614`
- **Currency:** ETH
- **Explorer:** `https://sepolia.arbiscan.io`

### 2.3 在 MetaMask 里添加 BSC Testnet

- **Name:** BSC Testnet
- **RPC URL:** `https://data-seed-prebsc-1-s1.binance.org:8545`
- **Chain ID:** `97`
- **Currency:** tBNB
- **Explorer:** `https://testnet.bscscan.com`

### 2.4 在两条链上分别为三个钱包充值

每个钱包在每条链上都需要少量原生币来支付网络手续费。

**Arbitrum Sepolia 水龙头：** `https://www.alchemy.com/faucets/arbitrum-sepolia`(或者向操作人员要一个备用链接)。把 MetaMask 切到 Arbitrum Sepolia,依次复制三个钱包地址,逐个到水龙头申请测试币。

**BSC Testnet 水龙头：** `https://testnet.bnbchain.org/faucet-smart`。把 MetaMask 切到 BSC Testnet,再给三个钱包各申请一次。

做完之后,三个账户在 Arbitrum 上应当有少量 ETH,在 BSC 上有少量 tBNB。

### 2.5 导出 Deployer 的私钥

1. MetaMask → Deployer 账户 → 三点菜单 → **Account details** → **Show private key**。
2. 复制私钥(以 `0x` 开头)。粘贴到一个临时文本文件里——Part 3 会用到。
3. **用完这份指南之后,把那个文件删掉。** Deployer 钱包只用于测试——绝对不要往里面放真钱。

---

## Part 3 — 部署 Operon 应用

这是一次性搭建过程。严格按步骤做。任何一步失败都不要自作主张——把错误复制给操作人员。

### 3.1 安装依赖

操作人员把 `operon-dashboard/` 文件夹交给你,就放在这份资料包里。进入该目录,打开一个 Git Bash 终端：

```
cd operon-dashboard
pnpm install
cd contracts && pnpm install && cd ..
```

两次 `pnpm install` 各需要几分钟。

### 3.2 创建一个免费的 Supabase 项目

Supabase 是本应用使用的数据库。

1. 打开 **supabase.com** → 注册 → **New project**。
2. 项目名称随意。数据库密码：生成一个并保存下来。区域：选一个离你最近的。
3. 等候约 1 分钟完成创建。
4. 左侧边栏 → 齿轮图标(**Project Settings**)→ **API**。保存下面三个值——3.6 步会用到：
   - **Project URL** → `SUPABASE_URL`
   - **anon public** 密钥 → `SUPABASE_ANON_KEY`
   - **service_role** 密钥 → `SUPABASE_SERVICE_KEY`
5. **Project Settings → Database → Connection string → URI 页签**。复制整段字符串。把 `[YOUR-PASSWORD]` 替换成第 2 步的数据库密码。这就是你的 `SUPABASE_DB_URL`。

### 3.3 在 Arbitrum Sepolia 上部署智能合约

进入 `contracts` 目录：

```
cd contracts
export DEPLOYER_PRIVATE_KEY=<粘贴 Part 2.5 里那段 0x... 私钥>
export ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
export BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
```

**部署一个 mock USDC 代币：**
```
npx hardhat run scripts/deploy-mock-usdc.ts --network arbitrumSepolia
```
把打印出来的地址保存为 `USDC_ARB`。

**部署主合约：**
```
export USDC_ADDRESS=<USDC_ARB>
export TOKEN_DECIMALS=6
export TREASURY_ADDRESS=<Deployer 钱包地址>
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```
把打印出来的两个地址保存为 `SALE_ARB` 和 `NODE_ARB`。

### 3.4 在 BSC Testnet 上部署智能合约

做法相同,但**请使用 BSC 专用的 mock 部署脚本**(symbol USDT、18 位小数)。Arbitrum 用的 `deploy-mock-usdc.ts` 把小数位数写死为 6,和 BSC 的 `TOKEN_DECIMALS=18` 不相容,会让后续每一笔购买都失败。

```
npx hardhat run scripts/deploy-mock-usdt.ts --network bscTestnet
```
保存为 `USDT_BSC`。

**跑下一段之前**,请另开一个新的终端(或在当前终端里先执行 `unset USDC_ADDRESS TOKEN_DECIMALS`)。`deploy.ts` 会读取下面 export 的环境变量——如果 §3.3 部署 Arbitrum 时留下的值还在当前 shell 里,BSC 的部署会静默地沿用那个错误的地址。

```
unset USDC_ADDRESS TOKEN_DECIMALS
export USDC_ADDRESS=<USDT_BSC>
export TOKEN_DECIMALS=18
npx hardhat run scripts/deploy.ts --network bscTestnet
```
保存为 `SALE_BSC` 和 `NODE_BSC`。

*(没错,BSC 上部署的是 USDT,但这里的环境变量名字仍然叫 `USDC_ADDRESS`。`deploy.ts` 把它当成「这条链上接受的稳定币地址」,跟币种符号没关系。不要被名字混淆。)*

**现在你手里应当有六个地址：** `USDC_ARB`、`SALE_ARB`、`NODE_ARB`、`USDT_BSC`、`SALE_BSC`、`NODE_BSC`。

### 3.5 铸造测试稳定币

仍在 `contracts` 目录下,打开 Arbitrum 的 Hardhat console：
```
npx hardhat console --network arbitrumSepolia
```
粘贴下面这几条命令,替换其中的地址。每行一条：
```
const usdc = await ethers.getContractAt("MockERC20", "<USDC_ARB>")
await usdc.mint("<Deployer 地址>", "10000000000")
await usdc.mint("<Wallet A 地址>", "10000000000")
await usdc.mint("<Wallet B 地址>", "10000000000")
```
这会给每个钱包铸造 10,000 个测试 USDC(6 位小数)。输入 `.exit` 退出。

再做一遍 BSC ——**注意多出来的零,因为 BSC 用的是 18 位小数**：
```
npx hardhat console --network bscTestnet
const usdt = await ethers.getContractAt("MockERC20", "<USDT_BSC>")
await usdt.mint("<Deployer 地址>", "10000000000000000000000")
await usdt.mint("<Wallet A 地址>", "10000000000000000000000")
await usdt.mint("<Wallet B 地址>", "10000000000000000000000")
```
输入 `.exit` 退出,然后：
```
cd ..
```

### 3.6 创建前端配置文件

在项目根目录(不是 `contracts`),创建一个文件,名字精确为 **`.env.local`**(注意最前面的那个点)。把下面这段粘贴进去,填入你自己的值：

```
NEXT_PUBLIC_NETWORK_MODE=testnet

NEXT_PUBLIC_SUPABASE_URL=<来自 3.2>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<来自 3.2>
SUPABASE_SERVICE_KEY=<来自 3.2>
SUPABASE_DB_URL=<来自 3.2>

JWT_SECRET=<见下文>

NEXT_PUBLIC_SALE_CONTRACT_ARB=<SALE_ARB>
NEXT_PUBLIC_NODE_CONTRACT_ARB=<NODE_ARB>
NEXT_PUBLIC_TESTNET_USDC_ARB=<USDC_ARB>

NEXT_PUBLIC_SALE_CONTRACT_BSC=<SALE_BSC>
NEXT_PUBLIC_NODE_CONTRACT_BSC=<NODE_BSC>
NEXT_PUBLIC_TESTNET_USDT_BSC=<USDT_BSC>

# 相同的合约地址,但服务器端读取时没有 NEXT_PUBLIC_ 前缀。
# Next.js 的 API 路由、reconcile cron 以及 pnpm dev:indexer 都会读这几个——
# 把它们设为和上面一样的值。
SALE_CONTRACT_ARBITRUM=<SALE_ARB>
SALE_CONTRACT_BSC=<SALE_BSC>

ADMIN_WALLETS=<Deployer 地址,全部小写>
ADMIN_PRIVATE_KEY=<来自 2.5 的 Deployer 私钥>

# ── 第 2 轮新增 —— 本地 dev 接口的门控 ────────────────────
# 本地事件索引器会向 /api/dev/indexer-ingest 和 /api/dev/drain-referrals
# 发送签名请求。这两条路由现在要求同时配置下面两个变量,并携带有效的
# HMAC 签名。任何一项缺失,本地环境里什么都不会动。
# 这两个变量只能在本地设置,绝对不要写入 Vercel 或任何云端部署的环境变量里。
DEV_ENDPOINTS_ENABLED=1
DEV_INDEXER_SECRET=<见下文>

# ── 可选但强烈建议 —— 私有 RPC ───────────────────────────────
# 不填下面这两行时,应用和 dev-indexer 会退回到免费的公共 RPC
# (例如 sepolia-rollup.arbitrum.io、publicnode 的 BSC)。
# 公共 RPC 在持续轮询下会被限流——在 2–4 小时的测试过程中你一定
# 会撞到 429,表现出来像是「推荐码迟迟无法同步」「NFT 一直没出现」
# 这类假阳性。花 2 分钟申请一把免费的 Alchemy (Arbitrum)
# 和 QuickNode / Infura (BSC) key,把 URL 填到下面:
#
#   Arbitrum Sepolia via Alchemy: https://www.alchemy.com/ → Arbitrum Sepolia app
#   BSC Testnet via QuickNode:    https://www.quicknode.com/ → BSC Testnet endpoint
#
ARBITRUM_RPC_URL=
BSC_RPC_URL=
```

生成 `JWT_SECRET`：
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
把输出粘贴到 `JWT_SECRET=` 那一行。

用同样的方式生成 `DEV_INDEXER_SECRET` —— 另生成**一串**随机的 32 字节十六进制(不要和 JWT_SECRET 相同)：
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
把输出粘贴到 `DEV_INDEXER_SECRET=` 那一行。

**再检查一遍：** `ADMIN_WALLETS` 必须**全部小写**。MetaMask 显示的是大小写混合——手动转成小写。

### 3.7 应用数据库迁移

最简单的办法是用 Supabase 的 SQL 编辑器,不要用终端。

1. 在浏览器里打开你的 Supabase 项目。
2. 左侧边栏 → **SQL Editor** → **New query**。
3. 在文件管理器里打开 `operon-dashboard/supabase/migrations` 文件夹。你会看到 `001_initial_schema.sql`、`002_seed_data.sql` 这样的文件。
4. 用文本编辑器打开 `001_initial_schema.sql`。全选,复制,粘贴到 Supabase SQL Editor。点击 **Run**。
5. 等到显示 **Success**。
6. 清空编辑器。按**编号顺序**对剩下的文件依次重复：002、003、004、005、006、008、009、010、011、012、013、014、015、016、017。**没有 007 —— 直接跳过。**

任何一个文件报错就停下,联系操作人员。

说明：
- `002_seed_data.sql` 预先写入了一批 EPP 邀请码,你在 Test 5 里可以直接用这些,不用另外生成。它还会插入几行演示数据(一个虚构的 "David Kim" EPP 合作伙伴、两条虚构的历史购买记录),纯粹是为了仪表板截图——请忽略,对 Tests 1–6 没有影响。
- `013_referral_chain_state.sql` 建立了一个队列,追踪每个推荐码是否已经同步到销售合约上。`014_seed_full_tier_curve.sql` 把 6–40 层的价格曲线填满,并重置层级状态,让数据库和全新部署的合约对齐。
- `017_guard_tier_reset.sql` 是 `014` 的补强:如果数据库里已经有真实购买记录,就跳过 `014` 会做的层级计数清零——让你在测试途中可以安全地重跑迁移清单,不会破坏计数。必须排在 `016` 之后。

### 3.8 启动网站

在项目根目录执行：
```
pnpm dev
```
20–30 秒后你会看到 `Local: http://localhost:3001`。用浏览器打开这个地址,应该能看到 Operon 首页。终端里关于 Sentry 的警告可以忽略。

**这个终端要保持运行**,在整个测试过程中都不要关。关掉它等于关掉网站。

### 3.8.1 启动本地事件索引器(**必做**,否则购买不会出现在站点上)

Vercel cron 和 Alchemy / QuickNode 的 webhook 都无法到达 `localhost`,所以测试环境需要一个本地事件轮询器。**再开一个终端窗口**(§3.8 的 `pnpm dev` 那个终端保持不动),在项目根目录执行：

```
pnpm dev:indexer
```

它会每约 5 秒向两条测试链轮询一次 `NodePurchased` 事件,并把新的事件转发到本地开发服务器。一两秒内你应当看到 `[dev-indexer] starting …`。

**第 2 轮新增——基础自检。** 启动后打印的第一行会告诉你索引器有没有读到 HMAC 密钥。如果你看到：

> `[dev-indexer] DEV_INDEXER_SECRET is not set in .env.local`

就停下来修改 `.env.local` —— 没有这个密钥,索引器根本跑不起来。如果脚本越过这一行继续执行,就没问题。

**跳过这一步会让 Test 3 的购买看起来凭空消失** —— MetaMask 会显示 NFT 已铸造、USDC / USDT 已扣除,但站点的仪表板、交易记录和推荐动态全是空的。这就是第 1 轮的 bug #13,在任何忘了启动索引器的本地开发环境里都会复现。

### 3.9 把测试代币导入 MetaMask

你要先告诉 MetaMask 追踪哪些代币,它才会显示这些测试 USDC / USDT 余额。

**在 Arbitrum Sepolia 上**,对三个钱包分别执行一次：
1. 把 MetaMask 切到 Arbitrum Sepolia 并选中该钱包。
2. 在 MetaMask 里往下滚动 → **Import tokens** → 粘贴 `USDC_ARB` → **Import**。
3. 你应当看到约 10,000 USDC。

**在 BSC Testnet 上**,对三个钱包分别执行一次：
1. 切到 BSC Testnet 并选中该钱包。
2. Import tokens → 粘贴 `USDT_BSC` → **Import**。
3. 你应当看到约 10,000 USDT。

---

## Part 4 — 开始测试前的自检清单

- [ ] 站点正在 `http://localhost:3001` 运行
- [ ] 第二个终端运行着 `pnpm dev:indexer`,没有 "DEV_INDEXER_SECRET not set" 错误
- [ ] MetaMask 里有三个账户：Deployer、Wallet A、Wallet B
- [ ] MetaMask 里已经添加 Arbitrum Sepolia 和 BSC Testnet
- [ ] 三个钱包在 Arbitrum 上都有少量 ETH,在 BSC 上都有少量 tBNB
- [ ] 三个钱包在 Arbitrum 上各显示约 10,000 USDC,在 BSC 上各显示约 10,000 USDT
- [ ] 六个合约地址已经记在某处
- [ ] 所有迁移都跑完了,包括最新的 015 —— 提前停下就会踩坑
- [ ] `.env.local` 同时写入了 `DEV_ENDPOINTS_ENABLED=1` 和 `DEV_INDEXER_SECRET=<hex>`

---

## Part 5 — 红色警报——立刻停下并上报

看到下面任何一种情况,立刻停下、截图、通知操作人员。这些都是上线当天的灾难。

1. **"Purchase successful" 在 MetaMask 确认交易之前就出现** —— 或者更糟,交易失败或根本没提交也显示成功。
2. **MetaMask 的授权弹窗金额不对。** 看 MetaMask 顶部显示的**易读金额**(格式类似 `95 USDC` 或 `95 USDT`),它应当和销售页面的价格大致一致。**出现以下任一情况即为红色警报：**
   - 显示 **Unlimited**
   - MetaMask 警告 "this site is requesting unlimited access"
   - 易读金额明显大于价格
   - *(BSC 提示：USDT 在 BSC 上使用 18 位小数,底层交易数据里的原始数字会很长——例如 $95 对应 `95000000000000000000`。这是正常的。请相信顶部的易读金额,不要去看底下的原始数字。)*
3. **付了钱,等了两分钟,My Nodes 页面上仍然没有 NFT。**(上报之前先看一眼 `pnpm dev:indexer` 所在的终端——如果它挂了或者满屏错误,重启它再等 30 秒。)
4. **推荐佣金落错了钱包**、或者在你用自己的推荐码时佣金进了自己的钱包、或者金额明显不对(零、负数、或者远大于购买金额)。
5. **销售页面显示的价格和 MetaMask 要求支付的金额不一致。**
6. **购买成功后,你的 USDC/USDT 余额没有减少对应的价格**,或者减少了一个完全不相关的金额。
7. **屏幕上出现原始代码文本** —— 例如 `sale.buyButton`、`{{discount}}`、`[object Object]`、`undefined`。
8. **你切到非英文语言,结果按钮、标题、菜单里仍然看到英文。** **(第 2 轮修复了 17 个缺失的销售页面翻译键 —— 如果在非英文页面上仍然看到英文,那就是真的 bug,需要上报。)**
9. **Arbitrum 上的购买显示为 BSC NFT 或反之**,或者 BSC 的佣金金额与 Arbitrum 差了几个数量级(几乎肯定是小数位数的 bug)。
10. **付了钱却什么也没发生** —— 没有 NFT、没有报错、没有 pending 状态、也没有成功。
11. **切换 MetaMask 账户之后,站点仍然显示上一个钱包的数据。** 如果你在 MetaMask 里换了账户,而 /referrals 或 /nodes 页面还在显示上一个钱包的节点和佣金,那就是跨钱包数据串扰的 bug,必须上报。(第 2 轮针对这种情况加了一层防御 —— 检测到账户变化时会强制重新签名。如果**没有**弹出重新签名提示,那就是红色警报。)

---

## Part 6 — 测试项

一共六个测试。按顺序执行,前面的测试为后面的测试准备状态。每个测试都包含 **目标(Goal)**、**步骤(Steps)**、以及以 ☐ 标记的**通过/失败检查项**。

这些测试只覆盖需要真人用浏览器和钱包才能验证的部分。合约逻辑、后端数学、限流、鉴权、签名校验都已经有自动化测试覆盖 —— 不要再手动测这些。

**实用提示 —— 销售页面有一个 Chain Selector(链选择器)。** 测试时要在 Arbitrum 和 BSC 之间切换,用**页面内的 Chain Selector**,不要用 MetaMask 的网络下拉菜单。如果你的钱包处于错误的网络,站点会显示一个 "Switch to X" 按钮 —— 点一下,然后在 MetaMask 里确认。这样切换最顺畅。

---

### Test 1 — 登录并获得一个推荐码

**目标：** 一个新钱包可以连接、签名,并获得自己的 `OPR-XXXXXX` 推荐码。

**准备：** MetaMask 切到 Arbitrum Sepolia,选中 Wallet A。

**步骤：**

1. 打开一个无痕窗口(Ctrl+Shift+N)。
2. 访问 `http://localhost:3001`。
3. 点击 **Connect Wallet** → **MetaMask** → **Connect**。
4. MetaMask 会第二次弹出,请求你**签名**一条消息。点击 **Sign**。
5. 点击菜单里的 **Referrals**。

**检查项：**

- ☐ 页面上显示一个以 `OPR-` 开头、共 6 个字符的推荐码。把它记下来 —— Test 2 会用到。
- ☐ 页面上能看到 Wallet A 的地址。
- ☐ **失败条件：** 没有推荐码、推荐码为空、格式错误、或显示了错误的钱包地址。

---

### Test 2 — 推荐链接和折扣

**目标：** 访问带 `?ref=OPR-XXXXXX` 的 URL 时,会正确绑定推荐人,并在销售页面显示 10% 折扣。不允许自我推荐。

**步骤：**

1. 打开一个新的无痕窗口。
2. 访问 `http://localhost:3001/?ref=<Test 1 里拿到的推荐码>`。
3. 点击 **Connect Wallet** → **MetaMask** → 选择 **Wallet B** → **Connect** → **Sign**。
4. 点击菜单里的 **Sale**。

**检查项：**

- ☐ 销售页面显示 **10% 折扣**(原价上有删除线,并出现一个绿色的 "10% off" 标记)。
- ☐ Wallet A 的推荐码出现在购买框顶部的推荐码徽章上(例如 `OPR-ABC123 ✓`)。
- ☐ **失败条件：** 没有折扣、折扣百分比不对、没有显示推荐人、或者显示了别的推荐码。

**等待时间说明 —— 第 2 轮新增。** 用全新的推荐码首次购买时,可能会经历约 5–15 秒的"待同步"状态,这段时间里 `dev:indexer` 会把推荐码推送到合约上。如果你看到红色的"正在把你的推荐码同步到链上"提示,等一下它会自动变绿。不要反复点击或狂刷新。

**现在尝试破坏它 —— 自我推荐：**

1. 断开 Wallet B(用应用里的 Disconnect 按钮,不要只在 MetaMask 里切)。打开一个新的无痕窗口。
2. 访问 `http://localhost:3001/?ref=<Wallet A 自己的推荐码>`。
3. 用 **Wallet A** 登录 —— 也就是拥有该推荐码的那个钱包。
4. 进入销售页面。

- ☐ 预期：没有折扣(签名完成的那一刻,10% 折扣就应当消失 —— 第 2 轮在登录后会重新做一次自我推荐校验)。
- ☐ **失败条件：** 登录之后折扣仍然是 10%,或者 Wallet A 在 Referrals 页面成了自己的推荐人。

---

### Test 3 — 购买节点并收取推荐佣金(跑两次)

**目标：** 核心资金路径 —— 授权、购买、拿到 NFT、推荐人拿到佣金。第一次在 Arbitrum 上用 USDC(数量 1)跑一次,第二次在 BSC 上用 USDT(数量 3)跑一次。这就是上线时资金真正流动的两个场景。两条链的小数位数差异,以及按数量相乘的计算,是最容易出现静默 bug 的两个地方。

---

#### Pass 1 —— Arbitrum Sepolia + USDC + 数量 1

**准备：** 以 Wallet B 登录(它在 Test 2 里由 Wallet A 推荐)。进入销售页面。用**页面内的 Chain Selector** 选择 **Arbitrum**。如果 MetaMask 当前处于其他网络,点击 "Switch to Arbitrum" 按钮并在 MetaMask 里确认。

确认推荐人和 10% 折扣仍然显示。

**在点击任何东西之前,记下 Wallet B 当前的 USDC 余额** —— 它就在支付代币按钮上,类似 "USDC — $10,000.00"。把这个值称为 `balance_before`。

**步骤：**

1. 选择 **数量：1**。
2. 代币选择 **USDC**。
3. **把销售页面显示的总价记下来。** 例如 `$95.00`。
4. 点击 **Approve**。
5. **仔细看 MetaMask 的授权弹窗。** 顶部 MetaMask 会显示一个易读金额,例如 `95 USDC`。它应当和步骤 3 的价格大致一致。
   - ☐ **立刻停下并上报**(红色警报 #2),如果：显示 **Unlimited**、警告 "unlimited access"、或金额明显大于价格。
6. 在 MetaMask 里点击 **Confirm**。等授权交易确认。
7. 在网页上点击 **Purchase**。
8. MetaMask 再次弹出。点击 **Confirm**。
9. **MetaMask 还在处理时,盯着网页。** 网页应当显示转圈或 "Confirming" 状态。只有在 MetaMask 显示交易确认之后,它才应当切到购买完成弹窗。
   - ☐ **立刻停下并上报**(红色警报 #1),如果：MetaMask 还没确认,网页就已经显示 "Successful"。

**通过/失败检查项：**

- ☐ 进入 **My Nodes**。应显示一个 NFT,归 Wallet B 所有,在 Arbitrum 上。
- ☐ 回到销售页面,检查支付代币按钮上的 USDC 余额 —— 称为 `balance_after`。**`balance_before - balance_after` 应当大致等于**步骤 3 记下的价格。几分钱的舍入差异可以接受。**红色警报 #6** —— 余额几乎没下降,或下降了几倍于价格。
- ☐ 进入 **Referrals**(仍以 Wallet B 登录)。购买应出现在你的动态里。
- ☐ Disconnect,改用 **Wallet A** 登录。进入 **Referrals**。
- ☐ 动态里应当能看到 Wallet B 的那笔购买。
- ☐ Wallet A 上应显示一笔佣金。**预期：约 $8.55**(L1 社区推荐费率为 10%,应用在折后价约 $85.50 之上)。几分钱舍入可以接受。**$8 到 $10** 之间都算通过;超出这个区间,把实际数字记下来并上报。
- ☐ **失败条件：** 没有 NFT、Wallet A 没有推荐记录、佣金为零(链式结算坏了)、为负数、或远大于购买金额。

---

#### Pass 2 —— BSC Testnet + USDT + 数量 3

**准备：** 仍以 Wallet B 登录。在销售页面上,用**页面内的 Chain Selector** 切到 **BNB Chain**。如果 MetaMask 还在 Arbitrum 上,站点会显示 "Switch to BNB Chain" 按钮 —— 点一下,在 MetaMask 里确认网络切换。

切链之后再次确认推荐人和 10% 折扣仍然显示 —— 这同时验证了推荐状态能在链切换后保留。

记下 Wallet B 当前的 **USDT** 余额,称为 `balance_before`。

**步骤：**

1. 选择 **数量：3**(这个测试故意一次性买多个,验证按数量相乘的计算)。
2. 代币选择 **USDT**。
3. **记下显示的总价。** 它应当大致等于单节点价格 × 3,再减 10% 折扣。例如每节点 $95、10% 折扣下买 3 个,总价约为 `$256.50`。销售页面在数量选择器下面也会显示单价 —— 顺便核对一下。
4. 点击 **Approve**。
5. MetaMask 授权弹窗：
   - ☐ 顶部的**易读金额**应当读作类似 `256.50 USDT` —— 和总价对应。
   - ☐ **提示：** BSC 上的 USDT 是 18 位小数,所以底层交易数据里的原始数字会很长(例如 `256500000000000000000`)。这是正常的。相信易读金额。
   - ☐ **立刻停下并上报**(红色警报 #2),如果显示 **Unlimited** 或易读金额明显不对。
6. 确认授权。等待。点击 **Purchase**。确认。留意是否出现早到的"成功"状态。

**通过/失败检查项：**

- ☐ **My Nodes** 现在应显示 **四个 NFT** —— 一个来自 Pass 1(Arbitrum)、**三个**来自 Pass 2(BSC)。
- ☐ 每个 NFT 上都清楚标明了所在的链。
- ☐ **余额检查：** USDT 的 `balance_before - balance_after` ≈ 步骤 3 的总价(例如约 $256.50)。否则就是**红色警报 #6**。
- ☐ Disconnect,改用 Wallet A 登录 → **Referrals**。你应当同时看到 Wallet B 的两笔事件 —— 一笔来自 Arbitrum 的单节点,一笔来自 BSC 的 3 节点。两条独立的佣金记录。
- ☐ BSC 那笔(3 节点)的佣金应当大致是 Arbitrum 单节点佣金的 3 倍。**预期：约 $25.65**(折后约 $256.50 的 10%)。**$24 到 $28** 之间可以接受。
- ☐ **如果 BSC 佣金偏离了 10^12 倍或者数量级完全不对,那就是小数位数的 bug。** 红色警报 #9。
- ☐ **失败条件：** My Nodes 上没有出现 3 个节点、BSC 的购买显示为 Arbitrum、链标签错了、或者 BSC 的佣金和 Arbitrum 的 3 倍明显不符。

---

**再做一次反向验证 —— 购买时自我推荐：**

1. 用 Wallet A 登录。进入销售页面。
2. 在购买框顶部的推荐码输入框里,输入 Wallet A 自己的 `OPR-XXXXXX` 推荐码。
3. 看字段的反应 —— 折扣不应生效,并且应该弹出一条提示："你不能使用自己的推荐码。"
4. 即便如此,仍然尝试完成购买。

- ☐ 预期：Wallet A 自己的推荐码**不会**带来折扣。即使购买真的走完,Wallet A 在 Referrals 页面上**不会**出现这笔自购的佣金。
- ☐ **失败条件(红色警报 #4)：** Wallet A 在自己的购买上拿到了佣金。

---

### Test 4 — 浏览器关闭后的恢复

**目标：** 测试员在购买过程中关掉浏览器时,站点不会停留在一个虚假的 "Successful" 状态。

**准备：** 用 Wallet A 登录 Arbitrum,进入销售页面。

**步骤：**

1. 开始一次购买：选数量 1,点 Approve → 在 MetaMask 里 Confirm → 等授权完成 → 点 Purchase。
2. MetaMask 弹出让你确认购买。**不要点 Confirm。** 而是**直接关掉整个浏览器窗口**。
3. 等 10 秒。重新打开浏览器,访问 `http://localhost:3001`,用 Wallet A 登录。

**检查项：**

- ☐ 进入 My Nodes。要么没有新 NFT(购买从未提交),要么销售页面顶部显示恢复出来的 pending 状态。
- ☐ 销售页面不应停留在永不结束的转圈上。
- ☐ **失败条件(红色警报 #1)：** 对于一笔根本没发生的购买,站点显示了 "Successful"。

---

### Test 5 — EPP 入驻与合作伙伴购买

**目标：** 精英合作伙伴(Elite Partner)入驻向导能够端到端走完,并成功创建合作伙伴。**创建之后,用这位合作伙伴的 `OPRN-XXXX` 推荐码购买节点,应当显示 15% 折扣(不是 10%),并产生一笔不同于社区推荐人的佣金。**

**准备 —— 你需要一个 EPP 邀请码。** 有两种方式：

**方式 A —— 使用预置邀请码(最简单)。** 你在 Part 3.7 里跑的 `002_seed_data.sql` 已经预先插入了几个 `EPP-XXXX` 邀请码。进入 Supabase 项目 → **Table Editor** → `epp_invites` 表 → 找一行 `status = 'pending'` 的记录,复制它的 `invite_code` 值。这就是你的邀请码。

**方式 B —— 通过管理 API 生成新的邀请码。** 再开一个终端窗口(让 `pnpm dev` 继续在原来的终端里跑),执行：
```
curl -X POST http://localhost:3001/api/admin/epp/invites \
  -H "Content-Type: application/json" \
  -H "Cookie: operon_session=<粘贴你的管理员会话 cookie>" \
  -d '{"count": 5}'
```
获取 `operon_session` cookie 的方法：用 **Deployer** 钱包在站点上登录(记住它是管理员钱包),然后在浏览器里按 **F12** → **Application** 标签 → **Cookies** → `http://localhost:3001` → 找到 `operon_session`,复制它的值。

---

#### 正常流程 —— 向导

1. 打开一个新的无痕窗口。
2. 访问 `http://localhost:3001/epp/onboard?inv=<你的 EPP 邀请码>`。
3. **Step 1 —— 欢迎信。** 读完后点 Next。
4. **Step 2 —— 条款。** 滚动到底部(共 9 节)。勾选 **I agree**。点 Next。
5. **Step 3 —— 钱包和表单。** 填写表单。点 Connect Wallet → 选一个**从未作为合作伙伴使用过的全新钱包**(如果需要,在 MetaMask 里新建一个 "Wallet D")。签署消息。
6. **Step 4 —— 确认。** 你会看到一个成功页面,显示一个以 `OPRN-` 开头的新合作伙伴推荐码。

**检查项：**

- ☐ 确认页面显示出新的合作伙伴推荐码(`OPRN-XXXX` 格式)。
- ☐ Referrals 页面(此时仍以新合作伙伴身份登录)显示出带 "Elite Partner" 徽章的合作伙伴卡片和对应的推荐码。
- ☐ **失败条件：** 向导崩溃、推荐码没显示、或者确认页面一片空白。

**把新的 `OPRN-XXXX` 推荐码记下来 —— 下一步会用到。**

---

#### 合作伙伴折扣与佣金测试

现在验证合作伙伴的推荐码带来 **15%** 折扣(不是 10%),并产生合作伙伴级别的佣金。

1. 把刚才的新合作伙伴 Disconnect。打开一个新的无痕窗口。
2. 访问 `http://localhost:3001/?ref=<你刚拿到的 OPRN-XXXX 推荐码>`。
3. 用一个**从未使用过的钱包**登录 —— 可以用 Deployer 钱包(它在 Part 3.5 里已经拿到两条链上的 USDC 和 USDT),或者在 MetaMask 里建一个 Wallet E 并充好值。
4. 进入 Arbitrum 上的销售页面。

**检查项：**

- ☐ **显示的折扣是 15%**,不是 10%。划掉的原价应当对应 15% 折扣,徽章或小结应当显示 "15% off"。
- ☐ 合作伙伴的 `OPRN-XXXX` 推荐码出现在推荐码徽章上。
- ☐ **失败条件：** 折扣是 10%(那是社区费率,不是合作伙伴费率),或者根本没有折扣。

接着买一个节点：

5. 数量 1,USDC,Approve → confirm → Purchase → confirm。等成功。

**购买之后的检查项：**

- ☐ Disconnect,改以新的 EPP 合作伙伴身份登录(Wallet D 或你入驻时使用的那个钱包)。进入 Referrals。
- ☐ 这笔购买应当出现在合作伙伴的动态里,并记入了一笔佣金。
- ☐ 这笔佣金金额应当与 Test 3 Pass 1 里 Wallet A 收到的佣金**明显不同** —— 合作伙伴和社区推荐人的费率不一样。如果两者完全相同,说明合作伙伴分级逻辑没有生效。
- ☐ **失败条件：** 没有佣金,或者佣金金额与社区推荐人的完全一致。

---

#### 尝试破坏

**a) 用过的邀请码。** 把刚才走完流程的邀请码拿回来,重新打开同一个入驻 URL。
- ☐ 预期：提示 "this invite has already been used"。

**b) 无效邀请码。** 访问 `http://localhost:3001/epp/onboard?inv=EPP-NOPE`。
- ☐ 预期：提示 "invalid invite"。

**c) 过期邀请码。** 进入 Supabase 项目 → Table Editor → `epp_invites` → 找一条未使用的记录 → 把 `expires_at` 改为昨天 → 保存。然后访问 `http://localhost:3001/epp/onboard?inv=<该邀请码>`。
- ☐ 预期：提示 "expired"。

**d) 跳过条款。** 用一个新的邀请码,走到 Step 2 时不勾选 I agree,尝试点 Next。
- ☐ 预期：无法继续。

---

### Test 6 — 多语言

**目标：** 每种语言都渲染出真实文本,不出现占位 key。没有英文漏出。

**步骤：** 用页面顶部的语言切换器,依次切到每种语言(**繁体中文、简体中文、韩文、越南文、泰文**),并访问下列页面：

- 销售页面(特别是购买框 —— 第 2 轮修复了一整批第 1 轮只存在于英文的销售页面 key)
- 推荐页面
- EPP 入驻欢迎信
- EPP 入驻条款

**对每种语言、每个页面：**

- ☐ 所有可见文本都是预期的语言。按钮、菜单、标题里没有英文单词。
- ☐ 没有像 `sale.buyButton`、`{{discount}}`、`undefined` 这样的原始代码。
- ☐ 按钮和标题没有溢出容器(泰文和韩文通常比英文长 —— 留意是否出现截断的文字)。
- ☐ **失败条件(红色警报 #7 或 #8)：** 出现以上任一种。

**另外：**

- ☐ 切到泰文,刷新页面 —— 仍然应当是泰文。

---

## Part 7 — 出现异常时怎么办

几种看起来像 bug 但其实不是的常见情况。在你动笔写 bug 报告之前,先在这里对照一下——能省下你和操作人员双方的时间。

### 7.1 推荐码一直卡在"正在将您的推荐码同步到链上"超过一分钟

**你看到的现象。** 输入推荐码之后,页面弹出红色提示*"正在将您的推荐码同步到链上,请稍候几秒再试。"* 这对一个刚生成的新推荐码来说很正常,通常持续 5–30 秒。但如果红色提示一直不消失、超过一分钟以上,说明后台同步被卡住了。

**为什么会这样。** 用户注册时,他的推荐码会**立刻**写入 Supabase 数据库——但它**同时还需要**在销售合约上做一次链上注册,因为当后续有人用这个码买节点时,合约本身会检查 `validCodes[code] == true`,只有这样才会自动给 10% 折扣。链上注册是一笔真实的交易,应用会在后台通过 RPC 端点向区块链发送。

如果你在 `.env.local`(§3.6)里把 `ARBITRUM_RPC_URL` 和 `BSC_RPC_URL` 留空,应用会回退到免费的公共 RPC 端点(`https://sepolia-rollup.arbitrum.io/rpc` 以及一个公共的 BSC 测试网 RPC)。这些公共端点的限流非常严格——测试跑两小时就很容易触发每 IP 的上限,此后所有后台请求都会返回 "429 Too Many Requests",同步也就停止推进了。

**怎么确认是 RPC 问题。** 看你第二个跑着 `pnpm dev:indexer` 的终端窗口。如果反复出现这样的行:

```
[dev-indexer] arbitrum RPC https://... unreachable: too many requests
[dev-indexer] arbitrum: switched to https://arbitrum-sepolia.publicnode.com
```

那就是被限流了。

**怎么修。**
1. 申请一个免费的 Alchemy API key：**alchemy.com** → New App → Arbitrum Sepolia → 复制 HTTPS URL。
2. 为 BSC Testnet 申请一个免费的 QuickNode(或 Infura、或 publicnode)端点。
3. 把这两个 URL 粘到 `.env.local` 的 `ARBITRUM_RPC_URL=` 和 `BSC_RPC_URL=` 两行。
4. 两个终端都用 Ctrl+C 停掉,然后重新运行 `pnpm dev`(第一个窗口)和 `pnpm dev:indexer`(第二个窗口)。
5. 等大约 10 秒——不用刷新,那条卡住的红色提示会自动变成绿色徽章。

私有 RPC 端点不会对你的请求量做限流,之后不会再遇到这个问题。

### 7.2 我买了一个节点,但 My Nodes 页面一直没出现

**最常见的原因**：你那个跑 `pnpm dev:indexer` 的终端没在运行,或者它悄悄挂掉了。没有它,链上事件(包括你这笔购买)传不到 dashboard。

**要做的事。**
1. 看第二个终端窗口。如果它已经关掉了,或者满屏都是红色错误,重新运行:`pnpm dev:indexer`。
2. 重启后等大约 30 秒——indexer 启动时会做一次追补扫描。
3. 刷新 My Nodes 页面。
4. 如果 NFT 在区块浏览器上能看到(Arbitrum Sepolia 用 Arbiscan、BSC Testnet 用 BscScan),但 dashboard 上**足足等了 2 分钟**还是没有——**这才是真正的 bug,请按 Part 8 的模板上报。**

### 7.3 `pnpm dev:indexer` 一启动就报错 "DEV_INDEXER_SECRET is not set"

你的 `.env.local`(§3.6)里少了 `DEV_INDEXER_SECRET=`。生成一个:

```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

把输出粘到 `DEV_INDEXER_SECRET=` 那一行,然后重启 `pnpm dev:indexer`。这个密钥和 `JWT_SECRET` 是**两个独立的值**,各自生成一个新的 32 字节随机数。

### 7.4 销售页面提示"请先完成登录",可是我明明已经登过了

你的会话 cookie 失效了——通常发生在数据库重置之后、长时间挂着不动之后、或者你刚刚重启了 dev 服务器。点击页面右上角的 **Disconnect**,再重新连接钱包。MetaMask 会让你再签一次 SIWE 登录——签完之后购买流程就恢复正常了。

### 7.5 看到"交易时间超过预期"的旋转图标,但什么也没动

这个提示会在 Approving 或 Confirming 状态下持续 60 秒后出现。它现在会给你一个区块浏览器的链接,让你直接去链上查看交易,**不会**再像以前那样把页面重置掉。会有两种情况:

- **浏览器显示交易已经确认。** Indexer 会在 30 秒内捕获到这笔交易,然后不用你刷新,成功画面就会出现。再等一分钟即可。
- **浏览器显示交易还在 pending**(或者根本不知道这笔交易)。打开 MetaMask——可能是你不小心把 Confirm 弹窗关掉了,在 MetaMask 里点 Confirm 就行,页面会自己跟上进度。

如果浏览器显示交易已经 reverted(被回滚),那就是一个真 bug,值得一份报告。

---

## Part 8 — 如何上报问题

对每个问题,把下列信息发给操作人员：

1. **属于哪个测试、哪一步。** 例如："Test 3 Pass 2 step 5 —— BSC 上的授权金额。"
2. **发生在哪条链。** Arbitrum Sepolia 还是 BSC Testnet。
3. **你做了什么。** 把每一步点击都列出来。
4. **你预期的结果。**
5. **实际发生了什么。** 如果有报错,附上精确的错误信息。
6. **截图或短视频**,如果问题是视觉相关的。
7. **严重程度：**
   - **阻断** —— 命中 Part 5 任何一条红色警报。
   - **严重** —— 坏了但没有资金风险。
   - **轻微** —— 样式或文字问题。
8. **是否可复现。** "每次都会"、"有时候"、或 "只发生过一次"。
9. **`pnpm dev:indexer` 终端的输出。** 如果 bug 是"什么也没出现",先看那个终端 —— 如果它挂了或满屏 401,索引器可能丢了 HMAC 密钥(检查 `.env.local`)。

如果符合红色警报,在消息开头加上 **红色警报 #X**。

另外有帮助的信息：钱包地址、交易哈希、大致时间、浏览器、操作系统。

---

## Part 9 — 已知事项 —— 不要上报

下列是我们已经知道、本次交付里没有修复的事项。你会看到它们,请不要花时间为它们写报告。

- **Resources** 页面上是占位链接。没关系。
- **Thai terms**(泰文条款)还没做最终法律审核。文字在那里只是为了功能测试。
- **Referrals 页面上的层级表**是一份固定参考,不根据个人状态生成独立行。这是故意的。
- 应用**没有管理员界面** —— 管理员操作通过 API 端点完成。这也是 Phase 1 阶段的有意选择。

---

## Part 10 — 推迟到主网处理,不是测试网 bug

**第 2 轮新增。** 下列事项来自一次"是否可以发版"的评审,将在主网上线前处理,但对本轮测试网的走查没有影响。如果你看到,请不要上报。

1. **部署时没有调用 `OperonNode.setTransferLockExpiry`。** 在这次测试网部署里,NFT 从第 0 分钟起就可以自由转移。产品规则(12 个月转账锁定)会通过一步运维操作在主网合约上完成设置,在正式开卖之前做好。测试员不需要转移节点,所以这一项对 Tests 1–6 没有影响。
2. **`/api/sale/validate-code` 接口存在推荐码枚举攻击面。** 这不是资金风险,只会泄漏推荐码是否存在,属于商业信息范畴。主网上线前会处理。

如果你看到的 bug **既不在** Known 列表里**也不在** Deferred 列表里**,请上报**。站点上其他一切都在测试范围内。
