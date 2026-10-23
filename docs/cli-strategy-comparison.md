# CLI 方案对比

本文对比 UniSat OpenAPI CLI 的两种产品形态：

- 方案一：OpenAPI 透传型 CLI，即当前代码实现方向。
- 方案二：功能聚合型 CLI，即围绕高价值业务场景封装少量能力。

## 背景

UniSat OpenAPI 覆盖的接口数量较多，既包括底层 indexer 查询，也包括 marketplace、BRC-20、Runes、Alkanes、inscription 等不同领域能力。CLI 可以有两种不同定位：

1. 尽可能完整暴露 OpenAPI 能力，让 agent 或脚本按接口语义自由调用。
2. 只暴露经过产品化整理后的高价值能力，把多个底层 API 聚合成面向任务的命令。

这两种方案并不是互斥关系，但它们解决的问题、使用体验和维护成本不同。

## 方案一：OpenAPI 透传型 CLI

### 定位

CLI 作为 OpenAPI 的本地能力层，主要负责把 UniSat OpenAPI 以命令行方式稳定暴露出来。

当前代码实现基本属于该方案：

- 提供通用 direct API call 能力。
- 从 swagger YAML 读取接口定义。
- 根据 OpenAPI `operationId` 生成独立 API 命令。
- 尽量让 CLI 参数、路径、query、body 与 OpenAPI 定义保持一致。
- 暴露尽可能完整的 API 接口集合。

### 当前代码已实现功能

当前 CLI 已经实现了方案一的基础闭环：

- 基础入口：支持 `--help` / `-h` / `help`、`--version` / `-v`，以及 `--format text|json`。
- API 发现：`commands` 可从本地缓存的 Swagger YAML 生成 API 命令列表，并支持过滤、分页和 `--all`。
- 通用调用：`api call --path <api-path>` 支持 path/query/body 参数、环境选择、API key 和 `--dry-run`。
- 独立 API 命令：基于 OpenAPI `operationId` 生成 `<api-command>`，支持 `--help`、`--dry-run`、`--env`、`--api-key`、`--format`，非 GET 操作支持 `--confirm`。
- 配置能力：`config bitcoin-key` / `config fractal-key` 可保存 API key，调用时按 `--api-key`、process env、用户配置 `.env` 的顺序读取。
- 打包能力：npm 包内置 swagger YAML，运行时也支持 `OPENAPI_SWAGGER_DIR` 覆盖；help 会显示当前 swagger 路径，方便 agent 读取。
- Agent 友好：JSON 模式下分页、dry-run、缺参、未知命令等场景尽量返回结构化结果。

### 典型命令形态

通用 API 调用：

```bash
unisat-openapi-cli api call --path "/v1/indexer/blockchain/info" --env bitcoin --format json
```

根据 OpenAPI `operationId` 生成的 API 命令：

```bash
unisat-openapi-cli getAlkanesInfo --alkaneid=2:1 --format json
```

接口发现：

```bash
unisat-openapi-cli commands --format json
unisat-openapi-cli commands --domain alkanes --limit 50 --format json
unisat-openapi-cli commands --all --format json
```

### 能力范围

方案一的能力边界是 OpenAPI 本身：

- OpenAPI 有什么接口，CLI 尽量暴露什么接口。
- OpenAPI 参数如何定义，CLI 参数尽量与其保持一致。
- OpenAPI 的 path/query/body 结构基本直接映射到 CLI。
- CLI 不主动做复杂业务编排，不替用户或 agent 判断业务意图。

### 优点

- 可以直接复用现有 swagger 文档，不需要为 CLI 单独设计和维护一套接口定义。
- 维护边界清晰，只需持续维护 swagger 这一份接口文档，CLI 能从中生成命令和参数说明。
- 新增或调整接口时，主要通过更新 swagger 完成，便于同步测试、release smoke 和接口覆盖检查。
- 覆盖面最大，所有可用 OpenAPI 都能被 agent 或脚本调用，适合调试、验证和底层能力开放。

### 缺点

- 现有接口列表中包含一些行为或数据重复、价值较低、特化场景、不推荐直接使用的接口，会给使用者带来额外知识负担。
- 接口粒度贴近底层 API，不一定贴近用户任务；使用者需要理解接口之间的关系和调用顺序。
- 部分功能必须多个接口配合使用，例如 marketplace 挂单、下架、购买等，仅调用单个接口没有完整业务意义。
- agent 或外部脚本仍需承担接口选择、任务拆解和多接口编排工作。

### 适用场景

- 面向 AI agent 的通用 UniSat OpenAPI 能力层。
- 面向开发者的 API 调试工具。
- 自动化测试、smoke test、接口覆盖检查。
- MCP server 的底层调用能力。
- 需要保持和 OpenAPI 一致的长期稳定接口。

### 风险点

- swagger 质量会直接影响 CLI 命令质量。
- 如果 API 数量继续增长，`commands` 输出、help 可读性和命令发现体验需要持续优化。
- 非 GET 接口需要严格确认机制，避免 agent 误执行有副作用操作。
- direct `api call` 与 generated API command 的语义必须保持一致，例如 `--dry-run`、错误格式、API key 读取顺序等。

## 方案二：功能聚合型 CLI

### 定位

CLI 不直接暴露所有 OpenAPI，而是围绕高价值业务场景提供少量任务级命令。每个命令内部可以调用一个或多个 OpenAPI，并把结果整理成更适合人或 agent 消费的结构。

方案二不是“API 调用工具”，而是“能力工具”或“业务工具”。

### 典型命令形态

示例命令可能类似：

```bash
unisat-openapi-cli create-inscribe-order --type brc20-mint --ticker <ticker> --amount <amount> --receive-address <address> --format json
unisat-openapi-cli marketplace-list-item --asset-type inscription --inscription-id <id> --price <sats> --seller-address <address> --format json
unisat-openapi-cli marketplace-cancel-listing --asset-type inscription --listing-id <id> --seller-address <address> --format json
unisat-openapi-cli marketplace-buy-item --asset-type inscription --listing-id <id> --buyer-address <address> --format json
```

这些命令不一定一一对应 OpenAPI path，而是面向一个明确任务。它们通常需要先查询资产、费用、订单或挂单状态，再创建订单、生成签名材料、提交交易或轮询结果。

### 能力范围

方案二只暴露经过筛选的能力：

- 创建铸造或铭刻订单：参数校验、费用估算、订单创建、支付信息和状态查询。
- marketplace 挂单：资产校验、价格/手续费检查、签名材料生成、挂单提交和结果确认。
- marketplace 下架：挂单状态检查、取消请求构造、签名/提交和状态确认。
- marketplace 购买：挂单查询、买家资金或 UTXO 检查、订单创建、交易提交和结果轮询。
- 复杂排查任务：围绕订单、挂单、交易或资产状态串联多个接口形成诊断结果。

每个命令可以在内部调用多个接口，并输出聚合后的结构化结果。

### 优点

- 可以提供具体且完整的功能需求，例如创建铸造订单、marketplace 挂单、下架、购买等，更贴合用户的实际使用目标。
- 只保留有价值、推荐使用的能力入口，减少低价值、重复或特化接口对用户造成的干扰。
- 对普通用户和 agent 更方便友好，用户不需要理解所有底层 API，也不需要自己判断多个接口的调用顺序。
- 可以在 CLI 内封装业务规则、默认参数、分页策略、重试策略和结果摘要，输出更接近最终任务结果。

### 缺点

- 需要在 CLI 中实现具体业务逻辑，开发工作量明显大于单纯 OpenAPI 透传。
- 每个聚合命令都需要单独设计、实现、测试和维护，后续维护成本较高。
- 需要单独维护一套面向功能命令的接口文档，不能完全复用 swagger 文档，文档维护成本增加。
- 聚合命令内部依赖多个底层 API，底层 API 变化时需要同步调整业务逻辑和测试用例，测试难度更大。

### 适用场景

- 面向最终用户或半技术用户的高频任务。
- 面向 agent 的稳定高价值工具集合。
- 需要减少接口选择成本的业务场景。
- 需要把多个 API 结果合并成一个答案的场景。
- 产品化、文档化、示例化程度较高的 CLI 入口。

### 风险点

- 需要明确哪些能力值得聚合，否则容易膨胀成另一套不完整 API。
- 聚合逻辑需要稳定测试，否则比单接口透传更容易出现隐藏错误。
- 需要定义每个聚合命令的输出契约，避免结果结构频繁变化。
- 需要持续跟进业务规则，例如不同资产协议、marketplace 状态、分页和异常处理。

## 核心对比

| 维度 | 方案一：OpenAPI 透传型 CLI | 方案二：功能聚合型 CLI |
| --- | --- | --- |
| 核心目标 | 暴露完整 OpenAPI 能力 | 暴露少量高价值业务能力 |
| 当前状态 | 当前代码实现方向 | 可作为后续增强方向 |
| 命令来源 | swagger YAML / `operationId` | 人工设计的业务命令 |
| 覆盖范围 | 尽可能覆盖全部 API | 只覆盖精选场景 |
| 参数设计 | 尽量与 API 参数一致 | 面向任务重新设计 |
| 输出形态 | 接近 API 原始响应或请求 plan | 聚合后的结构化结果 |
| agent 负担 | agent 负责选择接口和编排 | CLI 帮 agent 完成部分编排 |
| 用户体验 | 更偏开发者/API 调试 | 更偏产品化/任务导向 |
| 维护成本 | 主要维护 swagger 解析和通用调用 | 需要维护每个聚合能力 |
| 新 API 接入 | swagger 更新后可自动暴露 | 需要判断是否值得新增命令 |
| 风险 | 命令多、选择成本高 | 覆盖有限、业务逻辑变复杂 |

## 推荐策略

建议采用“双层 CLI”策略：

1. 保留方案一作为基础能力层。
2. 在方案一稳定后，逐步引入方案二作为高价值能力层。

也就是说：

- `api call` 和 `<api-command>` 继续承担完整 OpenAPI 透传能力。
- `commands` 继续作为 agent 发现 API 命令的入口。
- 后续可以新增少量聚合命令，但不要替代底层 API 命令。

推荐分层如下：

```text
UniSat OpenAPI CLI
├── 基础 API 层
│   ├── api call
│   ├── commands
│   └── <api-command>
└── 聚合能力层
    ├── create-inscribe-order
    ├── marketplace-list-item
    ├── marketplace-cancel-listing
    └── marketplace-buy-item
```

## 结论

方案一适合作为当前 CLI 的基础方向：完整、通用、与 OpenAPI 一致，适合 agent、开发者和自动化脚本。当前代码已经完成方案一的核心闭环，包括 API 发现、direct API call、generated API command、运行时 Swagger 缓存、dry-run、分页、help/version 和 JSON 错误输出；后续重点是继续补充 smoke 覆盖和边界一致性验证。

方案二适合作为后续产品化增强：只围绕少量高价值任务提供聚合能力，降低使用门槛，提高结果可读性。

