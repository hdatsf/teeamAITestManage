---
name: API Design
description: 团队 HTTP API 设计约定：资源命名、错误码、分页、版本与兼容性。
tags: backend, api, architecture
version: 2.0.0
---

# API Design

## 资源与路径

- 路径使用复数名词：`/api/v1/projects`、`/api/v1/skills/:slug`。
- 动作优先建模为资源，避免 `/doSomething` 式动词路径。
- 嵌套最多两层，超过两层改用筛选参数。

## 请求与响应

- JSON 字段使用 `camelCase`。
- 列表响应统一为 `{ "items": [...], "nextCursor": "..." }`。
- 时间使用 ISO 8601 UTC 字符串：`2026-11-09T08:30:00.000Z`。
- 不使用 200 包裹业务错误。

## 错误格式

```json
{
  "error": {
    "code": "SKILL_NOT_FOUND",
    "message": "Skill 'x' does not exist",
    "details": {}
  }
}
```

- 4xx 表示调用方可修复的问题；5xx 表示服务端故障。
- 错误码稳定、可枚举，文案可以本地化。

## 兼容性

- 破坏性变更必须升 `/v2`，不得在 `/v1` 内改变字段语义。
- 新增可选字段视为兼容；删除或改类型视为破坏性。
- 弃用字段至少保留两个发布周期，并在响应头或文档标注。

## 检查清单

- [ ] 幂等写入是否使用 PUT 或幂等键？
- [ ] 是否有速率限制与请求体大小限制？
- [ ] 列表是否支持分页与稳定排序？
- [ ] 敏感字段是否从日志与响应中剔除？
