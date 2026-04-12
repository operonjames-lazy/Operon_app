# TESTING_GUIDE.md — Operon 第一阶段

**适用对象：** 在 Operon 正式上线前协助测试的任何人。需要一台电脑、一个浏览器，总共约半天时间（大约 2 小时用于环境搭建，再 1–2 小时执行测试）。

**要做什么：** 在自己的电脑上部署 Operon 应用，在两条测试链（Arbitrum Sepolia 和 BSC Testnet）上设置加密钱包，然后测试关键的资金路径：购买节点、使用推荐链接、查看折扣，并确认佣金发放到正确的钱包。其他所有内容都已有自动化测试覆盖。只需要测试那些必须由真人用钱包手动验证的部分。

**为什么重要：** 上线后，用户将在两条区块链上支付真实资金。如果上线当天出现隐性故障——佣金错误、过早显示 "Successful"、折扣缺失——几乎无法事后修复。你的任务就是现在把这些问题找出来。

**不需要看懂代码。** 只需复制粘贴命令。出现任何错误请联系负责人，不要自行修改。

---

## 第一部分 — 安装所需工具

一共五项。已经装过的可以跳过。

### 1.1 Node.js(22 LTS 或更高版本）

1. 访问 **nodejs.org** → 下载 **LTS** 版本 → 安装。
2. 打开终端验证：
   ```
   node --version
   ```
   Windows 上请使用 **Git Bash**（在 1.3 安装 Git 时会一并装好）。不要用 PowerShell，不要用 CMD——本指南的许多命令在那两个环境下无法运行。

### 1.2 pnpm

```
npm install -g pnpm
```
验证：`pnpm --version` 应显示 9 或更高版本。

### 1.3 Git(Windows 上会附带 Git Bash)

从 **git-scm.com/downloads** 下载安装。Windows 版安装程序会在开始菜单中添加 **Git Bash**——本指南中的所有命令都请在 Git Bash 中执行。

### 1.4 MetaMask 浏览器扩展

1. **metamask.io** → 下载 → 安装。
2. 将扩展图标固定到浏览器工具栏（拼图图标 → 固定）。
3. 创建新钱包。把 12 个助记词抄到纸上。设置密码。

### 1.5 代码编辑器（可选）

会有一个配置文件需要编辑，任何编辑器都可以。没有的话可以从 **code.visualstudio.com** 下载 **VS Code**。

---

## 第二部分 — 设置钱包

需要在 MetaMask 里准备 **三个钱包**:

- **Deployer** —— 部署智能合约，同时也是管理员钱包。
- **Wallet A** —— 推荐链顶端。
- **Wallet B** —— 由 Wallet A 推荐。

### 2.1 创建三个 MetaMask 账户

点击 MetaMask 图标 → 右上角账户圆形图标 → **Add a new account** → 命名为 **Deployer**。再重复两次，分别创建 **Wallet A** 和 **Wallet B**。

### 2.2 在 MetaMask 中添加 Arbitrum Sepolia

网络下拉菜单 → **Add a custom network**:

- **Name:** Arbitrum Sepolia
- **RPC URL:** `https://sepolia-rollup.arbitrum.io/rpc`
- **Chain ID:** `421614`
- **Currency:** ETH
- **Explorer:** `https://sepolia.arbiscan.io`

### 2.3 在 MetaMask 中添加 BSC Testnet

- **Name:** BSC Testnet
- **RPC URL:** `https://data-seed-prebsc-1-s1.binance.org:8545`
- **Chain ID:** `97`
- **Currency:** tBNB
- **Explorer:** `https://testnet.bscscan.com`

### 2.4 为三个钱包在两条链上领取测试币

每个钱包都需要在两条链上各有少量原生币来支付手续费。

**Arbitrum Sepolia 水龙头：** `https://www.alchemy.com/faucets/arbitrum-sepolia`（备用水龙头请向负责人索取）。将 MetaMask 切换到 Arbitrum Sepolia，依次复制每个钱包的地址，在水龙头上为三个钱包全部领取测试币。

**BSC Testnet 水龙头：** `https://testnet.bnbchain.org/faucet-smart`。将 MetaMask 切换到 BSC Testnet。为三个钱包全部领取测试币。

完成后，三个账户在 Arbitrum 上都应显示少量 ETH，在 BSC 上都应显示少量 tBNB。

### 2.5 导出 Deployer 的私钥

1. MetaMask → Deployer 账户 → 三点菜单 → **Account details** → **Show private key**。
2. 复制私钥（以 `0x` 开头）。粘贴到临时文本文件中——第三部分会用到。
3. **完成本指南后请立即删除该文件。** Deployer 钱包只用于测试——绝不要往里存入真实资金。

---

## 第三部分 — 部署 Operon 应用

这是一次性的环境搭建。请严格按步骤执行。出现任何错误请复制错误信息联系负责人——不要自行修改。

### 3.1 获取代码

```
git clone <负责人提供的仓库地址>
cd operon-dashboard
pnpm install
cd contracts && pnpm install && cd ..
```

两条 `pnpm install` 命令各需几分钟。

### 3.2 创建免费的 Supabase 项目

Supabase 是本应用使用的数据库。

1. **supabase.com** → 注册 → **New project**。
2. 名称：随意。数据库密码：生成后妥善保存。区域：选择离你最近的。
3. 等待约 1 分钟完成初始化。
4. 左侧边栏 → 齿轮图标(**Project Settings**)→ **API**。保存下面三个值——3.6 会用到：
   - **Project URL** → `SUPABASE_URL`
   - **anon public** 密钥 → `SUPABASE_ANON_KEY`
   - **service_role** 密钥 → `SUPABASE_SERVICE_KEY`
5. **Project Settings → Database → Connection string → URI 选项卡**。复制连接字符串。将 `[YOUR-PASSWORD]` 替换为第 2 步设置的数据库密码。这就是 `SUPABASE_DB_URL`。

### 3.3 在 Arbitrum Sepolia 上部署智能合约

进入 `contracts` 目录：

```
cd contracts
export DEPLOYER_PRIVATE_KEY=<粘贴 2.5 步导出的 0x... 私钥>
export ARBITRUM_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
export BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545
```

**部署测试用 USDC 代币：**
```
npx hardhat run scripts/deploy-mock-usdc.ts --network arbitrumSepolia
```
将输出的地址保存为 `USDC_ARB`。

**部署主合约：**
```
export USDC_ADDRESS=<USDC_ARB>
export TOKEN_DECIMALS=6
export TREASURY_ADDRESS=<Deployer 钱包地址>
npx hardhat run scripts/deploy.ts --network arbitrumSepolia
```
将输出的两个地址分别保存为 `SALE_ARB` 和 `NODE_ARB`。

### 3.4 在 BSC Testnet 上部署智能合约

步骤相同，但精度是 18 位，不是 6 位。

```
npx hardhat run scripts/deploy-mock-usdc.ts --network bscTestnet
```
保存为 `USDT_BSC`。

```
export USDC_ADDRESS=<USDT_BSC>
export TOKEN_DECIMALS=18
npx hardhat run scripts/deploy.ts --network bscTestnet
```
分别保存为 `SALE_BSC` 和 `NODE_BSC`。

**到这里应该已经拿到六个地址：** `USDC_ARB`、`SALE_ARB`、`NODE_ARB`、`USDT_BSC`、`SALE_BSC`、`NODE_BSC`。

### 3.5 铸造测试用稳定币

仍然在 `contracts` 目录下，打开 Arbitrum 的 Hardhat 控制台：
```
npx hardhat console --network arbitrumSepolia
```
粘贴下面的命令，替换其中的地址。每行一条命令：
```
const usdc = await ethers.getContractAt("MockERC20", "<USDC_ARB>")
await usdc.mint("<Deployer 地址>", "10000000000")
await usdc.mint("<Wallet A 地址>", "10000000000")
await usdc.mint("<Wallet B 地址>", "10000000000")
```
这样每个钱包都会有 10,000 测试 USDC(6 位精度）。输入 `.exit` 退出。

现在处理 BSC —— **注意数字后面多出来的零，因为 BSC 使用 18 位精度**:
```
npx hardhat console --network bscTestnet
const usdt = await ethers.getContractAt("MockERC20", "<USDT_BSC>")
await usdt.mint("<Deployer 地址>", "10000000000000000000000")
await usdt.mint("<Wallet A 地址>", "10000000000000000000000")
await usdt.mint("<Wallet B 地址>", "10000000000000000000000")
```
输入 `.exit` 退出，然后：
```
cd ..
```

### 3.6 创建前端配置文件

在项目根目录（不是 `contracts` 目录）创建一个文件，文件名必须是 **`.env.local`**（注意开头的点）。粘贴以下内容，填入自己的值：

```
NEXT_PUBLIC_NETWORK_MODE=testnet

NEXT_PUBLIC_SUPABASE_URL=<来自 3.2>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<来自 3.2>
SUPABASE_SERVICE_KEY=<来自 3.2>
SUPABASE_DB_URL=<来自 3.2>

JWT_SECRET=<见下方说明>

NEXT_PUBLIC_SALE_CONTRACT_ARB=<SALE_ARB>
NEXT_PUBLIC_NODE_CONTRACT_ARB=<NODE_ARB>
NEXT_PUBLIC_TESTNET_USDC_ARB=<USDC_ARB>

NEXT_PUBLIC_SALE_CONTRACT_BSC=<SALE_BSC>
NEXT_PUBLIC_NODE_CONTRACT_BSC=<NODE_BSC>
NEXT_PUBLIC_TESTNET_USDT_BSC=<USDT_BSC>

ADMIN_WALLETS=<Deployer 地址,全部小写>
ADMIN_PRIVATE_KEY=<2.5 步导出的 Deployer 私钥>
```

生成 `JWT_SECRET`:
```
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
将输出粘贴到 `JWT_SECRET=` 这一行。

**请再次检查：** `ADMIN_WALLETS` 必须**全部小写**。MetaMask 显示的是大小写混合格式，请手动转为小写。

### 3.7 执行数据库迁移

最简单的方法是用 Supabase 的 SQL 编辑器，不是终端。

1. 在浏览器中打开 Supabase 项目。
2. 左侧边栏 → **SQL Editor** → **New query**。
3. 在文件管理器中打开 `operon-dashboard/supabase/migrations` 目录。可以看到 `001_initial_schema.sql`、`002_seed_data.sql` 等文件。
4. 用文本编辑器打开 `001_initial_schema.sql`。全选。复制。粘贴到 Supabase SQL Editor。点击 **Run**。
5. 等待出现 **Success**。
6. 清空编辑器。按**数字顺序**依次处理其余文件：002、003、004、005、006、008、009、010、011、012。**没有 007 —— 直接跳过。**

任何一个文件报错都立即停止并联系负责人。

说明：`002_seed_data.sql` 会向数据库中预先写入几个 EPP 邀请码。测试 5 可以直接使用这些邀请码，不必重新生成。

### 3.8 启动站点

在项目根目录下运行：
```
pnpm dev
```
20–30 秒后会看到 `Local: http://localhost:3000`。在浏览器中打开该地址，应能看到 Operon 主页。终端中有关 Sentry 或 PostHog 的警告可以忽略。

**整个测试期间保持这个终端窗口运行。** 关闭后站点会停止。

### 3.9 将测试代币导入 MetaMask

必须告诉 MetaMask 需要追踪哪些代币，否则不会显示测试 USDC / USDT 的余额。

**在 Arbitrum Sepolia 上**，对三个钱包都执行一次：
1. 将 MetaMask 切换到 Arbitrum Sepolia，选中该钱包。
2. 在 MetaMask 中向下滚动 → **Import tokens** → 粘贴 `USDC_ARB` → **Import**。
3. 应能看到约 10,000 USDC。

**在 BSC Testnet 上**，对三个钱包都执行一次：
1. 切换到 BSC Testnet，选中该钱包。
2. Import tokens → 粘贴 `USDT_BSC` → **Import**。
3. 应能看到约 10,000 USDT。

---

## 第四部分 — 开始测试前的清单

- [ ] 站点运行在 `http://localhost:3000`
- [ ] MetaMask 中有三个账户：Deployer、Wallet A、Wallet B
- [ ] MetaMask 已添加 Arbitrum Sepolia 和 BSC Testnet 两个网络
- [ ] 三个钱包在 Arbitrum 上都有少量 ETH，在 BSC 上都有少量 tBNB
- [ ] 三个钱包在 Arbitrum 上都显示约 10,000 USDC，在 BSC 上都显示约 10,000 USDT
- [ ] 六个合约地址都已记下
- [ ] 所有迁移文件都已执行，包括最后的 012 —— 如果提前停止会遇到 bug

---

## 第五部分 — 危险信号 —— 立即停止并上报

出现以下任何情况都请立即停止、截图，并联系负责人。这些都是上线日会造成严重后果的问题。

1. **MetaMask 尚未确认交易，页面就显示 "Purchase successful"** —— 或者交易已失败 / 从未提交却仍显示成功，后果更严重。
2. **MetaMask 授权弹窗的金额不对。** 查看 MetaMask 顶部的**可读金额**（显示为 `95 USDC` 或 `95 USDT` 这种格式），应大致与 Sale 页面的价格一致。出现以下情况即为**危险信号**:
   - 显示 **Unlimited**
   - MetaMask 警告 "this site is requesting unlimited access"
   - 可读金额明显比页面价格大出好几倍
   - *(BSC 说明：USDT 使用 18 位精度，所以可读金额下方的原始数字会很长 —— 例如 95 美元对应 `95000000000000000000`。这属于正常情况。请以可读金额为准，不要盯着原始数字看。)*
3. **付了款但 My Nodes 页面没有 NFT**，等两分钟后仍然没有。
4. **推荐佣金进入了错误的钱包**，或者使用自己的推荐码购买时反而给了自己佣金，又或者佣金金额明显不对（为零、负数，或远大于预期）。
5. **Sale 页面显示的价格与 MetaMask 要求支付的金额不一致。**
6. **购买成功后，USDC / USDT 余额没有按显示的价格扣减**，或扣减的金额差得离谱。
7. **页面上出现原始代码文本** —— 比如 `sale.buyButton`、`{{discount}}`、`[object Object]`、`undefined`。
8. **切换到非英文语言后，按钮、标题或菜单中仍出现英文。**
9. **在 Arbitrum 购买的节点显示为 BSC 的 NFT，或反过来**，又或者 BSC 与 Arbitrum 的佣金金额相差好几个数量级（几乎一定是精度 bug)。
10. **付了款却什么都没发生** —— 没有 NFT、没有错误、没有 pending 状态、也没有成功提示。

---

## 第六部分 — 测试

一共六个测试。请按顺序执行 —— 前面的测试会为后面的测试准备好数据。每个测试都包含 **目标**、**步骤**，以及用 ☐ 标出的 **通过 / 失败检查项**。

这些测试只涵盖必须由真人用浏览器和钱包验证的内容。合约逻辑、后端数学、频率限制、鉴权、签名验证都已有自动化测试覆盖 —— 不必手动测试。

**小技巧 —— Sale 页面上有链切换器。** 测试中需要在 Arbitrum 和 BSC 之间切换时，请使用 Sale 页面**应用内的链切换器**，而不是 MetaMask 的网络下拉菜单。如果钱包当前在错误的网络上，页面会显示 "Switch to X" 按钮 —— 点击后在 MetaMask 中确认即可。这个流程更顺畅。

---

### 测试 1 —— 登录并获取推荐码

**目标：** 新钱包可以正常连接、签名，并获得自己的 `OPR-XXXXXX` 推荐码。

**准备：** MetaMask 切到 Arbitrum Sepolia，选中 Wallet A。

**步骤：**

1. 打开隐身窗口(Ctrl+Shift+N)。
2. 访问 `http://localhost:3000`。
3. 点击 **Connect Wallet** → **MetaMask** → **Connect**。
4. MetaMask 会再次弹出，要求你**签名**（Sign）一条消息。点击 **Sign**。
5. 点击菜单中的 **Referrals**。

**检查：**

- ☐ 页面显示以 `OPR-` 开头、后跟 6 个字符的推荐码。记下来 —— 测试 2 会用到。
- ☐ 页面上显示的是 Wallet A 的地址。
- ☐ **失败条件：** 没有推荐码、推荐码为空、格式错误，或显示的钱包地址错误。

---

### 测试 2 —— 推荐链接与折扣

**目标：** 带 `?ref=OPR-XXXXXX` 参数访问能正确绑定推荐人，并在 Sale 页面显示 10% 折扣。系统应拒绝自我推荐。

**步骤：**

1. 打开新的隐身窗口。
2. 访问 `http://localhost:3000/?ref=<测试 1 记下的推荐码>`。
3. 点击 **Connect Wallet** → **MetaMask** → 选择 **Wallet B** → **Connect** → **Sign**。
4. 点击菜单中的 **Sale**。

**检查：**

- ☐ Sale 页面显示 **10% 折扣**（原价上有删除线，绿色 "10% off" 标签）。
- ☐ 购买框顶部的推荐码标签显示 Wallet A 的推荐码（例如 `OPR-ABC123 ✓`)。
- ☐ **失败条件：** 没有折扣、折扣比例错误、没有推荐人，或显示的是别的推荐码。

**现在尝试破坏 —— 自我推荐：**

1. 登出 Wallet B。打开新的隐身窗口。
2. 访问 `http://localhost:3000/?ref=<Wallet A 自己的推荐码>`。
3. 用 **Wallet A** 登录 —— 也就是推荐码的所有者。
4. 进入 Sale 页面。

- ☐ 预期：不应用折扣。无法自我推荐。
- ☐ **失败条件：** 应用了 10% 折扣，或 Wallet A 在 Referrals 页面显示为自己的推荐人。

---

### 测试 3 —— 购买节点并接收推荐佣金（执行两次）

**目标：** 核心资金路径 —— 授权、购买、拿到 NFT、推荐人收到佣金。先在 Arbitrum 上用 USDC 执行一次（数量 1)，再在 BSC 上用 USDT 执行一次（数量 3)。这是上线后真实资金真正流动的两条链路。两条链的精度差异和数量乘法，是产生隐性 bug 最常见的两个来源。

---

#### 第一轮 —— Arbitrum Sepolia + USDC + 数量 1

**准备：** 用 Wallet B 登录（测试 2 中已由 Wallet A 推荐）。进入 Sale 页面。使用页面上的**应用内链切换器**选择 **Arbitrum**。如果 MetaMask 当前在其他网络上，点击 "Switch to Arbitrum" 按钮并在 MetaMask 中确认。

确认推荐人和 10% 折扣仍然显示。

**在点击任何按钮之前，先记下 Wallet B 当前的 USDC 余额** —— 在支付代币按钮上可以看到，例如 "USDC — $10,000.00"。把这个数字记为 `balance_before`。

**步骤：**

1. 选 **数量：1**。
2. 支付代币选 **USDC**。
3. **记下 Sale 页面显示的总价。** 例如：`$95.00`。
4. 点击 **Approve**。
5. **仔细查看 MetaMask 授权弹窗。** 弹窗顶部的可读金额（例如 `95 USDC`)应大致与第 3 步记下的价格一致。
   - ☐ **立即停止并上报**（危险信号 #2):如果显示 **Unlimited**、警告 "unlimited access"，或金额明显大于页面价格。
6. 在 MetaMask 中点击 **Confirm**。等待授权交易确认。
7. 在网站上点击 **Purchase**。
8. MetaMask 再次弹出。点击 **Confirm**。
9. **在 MetaMask 仍在处理时紧盯网站。** 网站应显示加载动画或 "Confirming" 状态。只有在 MetaMask 显示交易已确认**之后**，才应切换到 Purchase Complete 弹窗。
   - ☐ **立即停止并上报**（危险信号 #1):如果 MetaMask 尚未确认，网站就显示 "Successful"。

**通过 / 失败检查：**

- ☐ 进入 **My Nodes**。应有一个 NFT，属于 Wallet B，位于 Arbitrum。
- ☐ 回到 Sale 页面，查看支付代币按钮上的 USDC 余额 —— 记为 `balance_after`。**`balance_before - balance_after` 应大致等于**第 3 步记下的价格。几美分以内的四舍五入误差可以接受。**危险信号 #6**:余额几乎没有下降，或下降的金额比价格大出许多倍。
- ☐ 进入 **Referrals**（仍以 Wallet B 身份）。活动列表中应出现这次购买记录。
- ☐ 登出。用 **Wallet A** 登录。进入 **Referrals**。
- ☐ 活动列表中应出现 Wallet B 的购买记录。
- ☐ Wallet A 上显示一笔佣金。**预期金额：约 $8.55**（社区 L1 费率为 10%，作用于折扣后约 $85.50 的价格）。几美分的误差可以接受。**$8 到 $10** 之间都算合格；超出这个范围请记下实际数字并上报。
- ☐ **失败条件：** 没有 NFT、Wallet A 上没有推荐记录、佣金为零（推荐链遍历有问题）、负数，或远远大于购买价格。

---

#### 第二轮 —— BSC Testnet + USDT + 数量 3

**准备：** 仍以 Wallet B 登录。在 Sale 页面用**应用内链切换器**切到 **BNB Chain**。如果 MetaMask 还在 Arbitrum 上，页面会显示 "Switch to BNB Chain" 按钮 —— 点击后在 MetaMask 中确认切换网络。

切链之后确认推荐人和 10% 折扣仍然显示 —— 这是在验证推荐状态能否跨链保留。

把 Wallet B 当前的 **USDT** 余额记为 `balance_before`。

**步骤：**

1. 选 **数量：3**（本测试故意买多个，以验证乘法计算）。
2. 支付代币选 **USDT**。
3. **记下显示的总价。** 总价应约为单节点价格的 3 倍再打 9 折。例如 3 个节点每个 $95 打 9 折后为 `$256.50`。数量选择器下方还会显示单节点价格 —— 对照检查一下。
4. 点击 **Approve**。
5. MetaMask 授权弹窗：
   - ☐ 顶部显示的**格式化**金额应为 `256.50 USDT` 左右 —— 与总价一致。
   - ☐ **提醒：** BSC 上的 USDT 使用 18 位精度，所以交易数据中的原始数字会很长（例如 `256500000000000000000`)。这是正常的。请以格式化金额为准。
   - ☐ **立即停止并上报**（危险信号 #2):显示 **Unlimited** 或格式化金额严重错误。
6. 确认授权。等待。点击 **Purchase**。确认。注意是否过早显示成功。

**通过 / 失败检查：**

- ☐ **My Nodes** 现在应显示 **四个 NFT** —— 一个来自第一轮(Arbitrum),**三个**来自第二轮(BSC)。
- ☐ 每个 NFT 都清晰标注了所属链。
- ☐ **余额检查：** USDT `balance_before - balance_after` ≈ 第 3 步记下的总价（约 $256.50)。不一致即**危险信号 #6**。
- ☐ 用 Wallet A 登录 → **Referrals**。应能看到 Wallet B 的**两次**活动 —— 一次 Arbitrum 单节点、一次 BSC 三节点。两条独立的佣金记录。
- ☐ BSC 三节点那次的佣金大致应为 Arbitrum 单节点佣金的 3 倍。**预期金额：约 $25.65**（折扣后约 $256.50 的 10%)。**$24 到 $28** 之间都算合格。
- ☐ **如果 BSC 佣金相差 10^12 或处于完全不同的数量级，那就是精度 bug。** 危险信号 #9。
- ☐ **失败条件：** My Nodes 没有出现 3 个新 NFT、BSC 的购买显示为 Arbitrum、链标注错误，或 BSC 佣金明显偏离 Arbitrum 佣金的 3 倍。

---

**一项对抗性检查 —— 购买时自我推荐：**

1. 用 Wallet A 登录。进入 Sale 页面。
2. 在购买框顶部的推荐码输入框中输入 Wallet A 自己的 `OPR-XXXXXX` 推荐码。
3. 观察输入框的行为 —— 要么直接拒绝，要么接受但不应用折扣。
4. 无论如何都尝试完成购买。

- ☐ 预期：Wallet A 自己的推荐码**不**会带来折扣。即使购买成功，Referrals 页面上也**不会**出现 Wallet A 因自己购买获得的佣金记录。
- ☐ **失败条件（危险信号 #4):** Wallet A 从自己的购买中获得了佣金。

---

### 测试 4 —— 浏览器关闭后的恢复

**目标：** 测试者在购买过程中关闭浏览器后，站点不应进入虚假的 "Successful" 状态。

**准备：** 在 Arbitrum 上用 Wallet A 登录。进入 Sale 页面。

**步骤：**

1. 开始一次购买：选数量 1，点击 Approve → 在 MetaMask 中 Confirm → 等待授权 → 点击 Purchase。
2. MetaMask 弹出要求确认购买。**不要点 Confirm。** 直接**关闭整个浏览器窗口**。
3. 等 10 秒。重新打开浏览器，访问 `http://localhost:3000`，用 Wallet A 登录。

**检查：**

- ☐ 进入 My Nodes。要么没有新的 NFT（购买从未提交），要么 Sale 页面顶部显示已恢复的 pending 状态。
- ☐ Sale 页面不应卡在一直转动的加载动画上。
- ☐ **失败条件（危险信号 #1):** 站点为一笔从未发生的购买显示 "Successful"。

---

### 测试 5 —— EPP 入驻与合作伙伴购买

**目标：** Elite Partner 入驻向导能端到端走完整个流程并创建一名合作伙伴。**创建成功后，使用该合作伙伴的 `OPRN-XXXX` 推荐码购买时，应显示 15% 折扣（不是 10%），且佣金金额与社区推荐人不同。**

**准备 —— 需要一个 EPP 邀请码。** 有两种方式：

**方式 A —— 使用预置邀请码（最简单）。** 在 3.7 执行 `002_seed_data.sql` 时，数据库里已经预先写入了几个 `EPP-XXXX` 邀请码。打开 Supabase 项目 → **Table Editor** → `epp_invites` 表 → 找一条 `status = 'pending'` 的行，复制其 `invite_code` 值。这就是一个可用的新邀请码。

**方式 B —— 通过管理员 API 生成新邀请码。** 打开**新的终端窗口**（保留原来跑 `pnpm dev` 的窗口不动）并执行：
```
curl -X POST http://localhost:3000/api/admin/epp/invites \
  -H "Content-Type: application/json" \
  -H "Cookie: operon_session=<粘贴管理员会话 cookie>" \
  -d '{"count": 5}'
```
获取 `operon_session` cookie 的方法：用 **Deployer** 钱包在网站上登录（这就是管理员钱包），然后在浏览器中按 **F12** → **Application** 标签 → **Cookies** → `http://localhost:3000` → 找到 `operon_session` 并复制它的值。

---

#### 正常流程向导

1. 打开新的隐身窗口。
2. 访问 `http://localhost:3000/epp/onboard?inv=<你的 EPP 邀请码>`。
3. **第 1 步 —— 欢迎信。** 阅读后点击 Next。
4. **第 2 步 —— 条款。** 滚动到底部（共 9 个章节）。勾选 **I agree**。点击 Next。
5. **第 3 步 —— 钱包与表单。** 填写表单。点击 Connect Wallet → 选择一个**从未用作合作伙伴的全新钱包**（如有需要请新建 "Wallet D")。签名消息。
6. **第 4 步 —— 确认页。** 成功页面上会出现一个以 `OPRN-` 开头的新合作伙伴码。

**检查：**

- ☐ 确认页显示新的合作伙伴码（格式为 `OPRN-XXXX`)。
- ☐ Referrals 页面（仍以新合作伙伴身份登录）显示带 "Elite Partner" 标签的合作伙伴卡片以及合作伙伴码。
- ☐ **失败条件：** 向导崩溃、合作伙伴码缺失，或确认页空白。

**记下这个新的 `OPRN-XXXX` 码 —— 下一步会用到。**

---

#### 合作伙伴折扣与佣金测试

现在验证合作伙伴的推荐码确实带来 **15%** 折扣（不是 10%)，且产生的是合作伙伴等级的佣金。

1. 登出新合作伙伴。打开新的隐身窗口。
2. 访问 `http://localhost:3000/?ref=<刚才记下的 OPRN-XXXX 码>`。
3. 用一个从未使用过的钱包登录 —— 可以用 Deployer 钱包（在 3.5 中它在两条链上都有 USDC 和 USDT)，也可以在 MetaMask 中新建 Wallet E 并为它充值。
4. 在 Arbitrum 上进入 Sale 页面。

**检查：**

- ☐ **显示的折扣是 15%**，不是 10%。原价应带删除线并显示 15% 折扣，标签或汇总处显示 "15% off"。
- ☐ 推荐码标签中显示的是合作伙伴的 `OPRN-XXXX` 码。
- ☐ **失败条件：** 折扣显示为 10%（这是社区费率，不是合作伙伴费率），或完全没有折扣。

现在购买一个节点：

5. 数量 1、USDC、Approve → 确认 → Purchase → 确认。等待成功。

**购买后检查：**

- ☐ 用新入驻的 EPP 合作伙伴登录(Wallet D 或入驻时用的那个钱包）。进入 Referrals。
- ☐ 该次购买出现在合作伙伴的活动中，并已记入一笔佣金。
- ☐ 佣金金额应与测试 3 第一轮中 Wallet A 从 Wallet B 购买获得的佣金**明显不同** —— 合作伙伴的费率与社区推荐人不同。如果两者完全一致，说明合作伙伴等级逻辑没有生效。
- ☐ **失败条件：** 没有佣金，或佣金金额与社区推荐费率完全相同。

---

#### 破坏性测试

**a) 已使用过的邀请码。** 拿刚刚走完流程的那个邀请码，重新访问同一条入驻 URL。
- ☐ 预期：显示 "this invite has already been used" 消息。

**b) 无效邀请码。** 访问 `http://localhost:3000/epp/onboard?inv=EPP-NOPE`。
- ☐ 预期：显示 "invalid invite" 消息。

**c) 过期邀请码。** 打开 Supabase 项目 → Table Editor → `epp_invites` → 找一条未使用的行 → 将 `expires_at` 改为昨天的日期 → 保存。访问 `http://localhost:3000/epp/onboard?inv=<该邀请码>`。
- ☐ 预期：显示 "expired" 消息。

**d) 跳过条款。** 使用新的邀请码。在第 2 步不勾选同意框，尝试点击 Next。
- ☐ 预期：无法继续。

---

### 测试 6 —— 多语言

**目标：** 每种语言都显示真实译文，而非占位键名。不漏英文。

**步骤：** 使用页面顶部的语言切换标签。依次切换到每种语言(**繁体中文、简体中文、韩文、越南文、泰文**)，并访问以下页面：

- Sale 页面
- Referrals 页面
- EPP 入驻欢迎信
- EPP 入驻条款

**对每种语言、每个页面：**

- ☐ 所有可见文本都应为目标语言。按钮、菜单、标题中不应出现任何英文。
- ☐ 不应出现 `sale.buyButton`、`{{discount}}`、`undefined` 等原始代码。
- ☐ 按钮和标题不应溢出容器（泰文和韩文通常比英文长 —— 注意有没有文字截断）。
- ☐ **失败条件（危险信号 #7 或 #8):** 出现上述任何问题。

**另外：**

- ☐ 切到泰文后刷新页面 —— 应仍然是泰文。

---

## 第七部分 — 如何上报问题

每个问题都请向负责人提供以下信息：

1. **在哪个测试的哪一步。** 例如："Test 3 Pass 2 step 5 — approval amount on BSC"。
2. **哪条链** —— Arbitrum Sepolia 或 BSC Testnet。
3. **你做了什么** —— 逐步点击过程。
4. **预期结果。**
5. **实际发生了什么** —— 如有错误请提供完整错误信息。
6. **截图或短视频录屏**，如果是视觉类问题。
7. **严重程度：**
   - **Blocker（阻塞级）** —— 命中第五部分任何一条危险信号。
   - **Serious（严重级）** —— 功能异常，但不涉及资金风险。
   - **Minor（轻微级）** —— 外观瑕疵或拼写错误。
8. **能否复现？** —— "每次必现"、"偶发"，或"只出现过一次"。

命中危险信号时，请在消息开头注明 **RED FLAG #X**。

以下信息也很有用：钱包地址、交易哈希、大致时间、浏览器、操作系统。

---

## 第八部分 — 已知问题 —— 无需上报

- **Resources** 页面上有占位链接，这是正常的。
- **泰文条款**尚未完成最终法律审核。当前文本仅供功能测试使用。
- **Referrals 页面的等级表**是一份固定的参考表，并非按用户个性化生成。这是有意为之。
- 本应用**没有管理员 UI** —— 所有管理员操作都通过 API 接口完成。这也是第一阶段的有意设计。
