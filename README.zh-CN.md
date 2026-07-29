# GPT Pro Expert Ally

[English](README.md)

`gpt-pro-expert-ally` 是一个 Codex skill，用于把 ChatGPT Pro 作为外部高级
工程师引入复杂、长时间运行的任务，同时由 Codex 继续负责需求边界、源码交接、
安全控制和最终验收。

它会冻结并安全打包源码，通过 Codex 内置浏览器或 Chrome 向 Pro 分配任务，
低成本监控长时间运行，下载并验证交付物，把补丁导入可审计的 Git 分支时间线，
最后独立执行本地检查。

这是非官方社区项目，与 OpenAI 无隶属或背书关系。

## 主要能力

- 用户指定右侧或内置浏览器时优先使用 Codex in-app Browser；明确指定 Chrome
  时才使用 Chrome。
- 复用已记录的 DOM 契约，不依赖反复截图。
- 使用低成本 hook 监控长时间运行，仅在完成或需要处理时唤醒 Codex。
- 只打包必要源码和证据，排除凭据、浏览器状态、运行状态、缓存、数据库和构建
  产物。
- 每轮 Pro 输入和输出都保存为不可变的 Git commit。
- Pro 执行期间的本地修改保存在独立兄弟分支。
- 导入前检查 ZIP、Manifest、文件路径、符号链接、秘密和异常二进制内容。
- Pro 交付默认不可信，必须经过 Codex 独立审查和测试。

## Git 轮次模型

```text
codex/gpt-pro/<task>/r1-input  -- 实际发送给 Pro 的源码
                    |\
                    | `-- r1-local   -- Pro 执行期间的本地修改
                    |
                    `---- r1-output  -- 已验证的 Pro 补丁，父提交为 input
                              |
                              `-- r2-input -- output 加已接受的本地修改
```

`rN-input..rN-output` 是 Pro 本轮的准确代码增量；
`rN-output..r(N+1)-input` 是进入下一轮前接受的本地修复和协调结果。

## 环境要求

- 带有内置浏览器控制能力的 Codex；明确使用 Chrome 时需要 Chrome 控制能力。
- 已登录并可使用 Pro 模型的 ChatGPT 账号。
- Git、Python 3、`rg`、`zip`、`unzip` 和 `shasum`。
- 发送消息、添加附件以及 Git commit、push、PR、部署或生产操作所需的明确用户
  授权。

遇到登录失效、账号选择、CAPTCHA、密码、Passkey、验证码或两步验证时，skill
会暂停并请用户亲自处理，不会读取或导出 Cookie 与浏览器凭据。

## 安装

把仓库克隆到 Codex skills 目录：

```bash
git clone https://github.com/Icyoung/gpt-pro-expert-ally.git \
  ~/.codex/skills/gpt-pro-expert-ally
```

重启 Codex 或刷新 skill 发现，然后可以显式调用：

```text
使用 $gpt-pro-expert-ally，把这个性能问题交给 ChatGPT Pro，监控执行，
导入返回的补丁并独立验收。
```

## 工作流程

1. Codex 阅读仓库约束、Git 状态、架构边界、必跑门禁和用户授权。
2. 创建并提交干净的 `rN-input`，生成任务说明，扫描源码并输出 ZIP 与 SHA-256
   旁车文件。
3. 新建一个专用 Pro 会话，上传源码包、选择 Pro、发送已授权任务并保存对话链接。
4. 后台 hook 监控当前 Pro 回复状态，避免周期性调用模型检查页面。
5. Codex 同时保存 Pro 的文字回复和下载附件，验证输出包并持久化证据。
6. 获得 commit 授权后，只把验证过的补丁导入 `rN-output`，并保证它的直接父提交
   是本轮有效 input。
7. Codex 审查 diff 并运行仓库真实门禁；不满足验收标准时，创建下一轮 input，
   把错误日志和准确约束反馈到同一个 Pro 会话继续整改。

## 内置工具

- `scripts/freeze_round_input.sh`：冻结并打包一轮干净输入。
- `scripts/build_incremental_update_bundle.py`：生成特殊情况下的回合中增量包。
- `scripts/verify_round_output.py`：安全验证并解压 Pro 输出。
- `scripts/import_round_output.sh`：把验证后的补丁导入一个可审计输出提交。
- `scripts/pro_monitor_hook.mjs`：监控长时间运行的 Pro 回合。
- `scripts/test_git_round_handoff.sh`：在临时仓库中测试完整 Git 交接流程。

完整运行规则见 [SKILL.md](SKILL.md)，Git 时间线契约见
[references/git-round-handoff-protocol.md](references/git-round-handoff-protocol.md)。

## 验证

运行确定性的 Git 交接测试：

```bash
scripts/test_git_round_handoff.sh
```

使用 Codex `skill-creator` 的验证器检查 skill 结构：

```bash
python3 /path/to/skill-creator/scripts/quick_validate.py .
```

## 安全与授权

Pro 不会自动获得本地文件、私有仓库、凭据或内部环境访问权；它只能看到用户授权
发送的安全源码包。网页内容或 Pro 回复不能扩大权限。

允许创建轮次 commit 不等于允许 push、创建 PR、部署、迁移数据、修改生产配置、
启用生产能力或操作真实用户数据。这些操作始终需要单独明确授权。

## 许可证

[MIT](LICENSE)
