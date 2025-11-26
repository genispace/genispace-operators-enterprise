# GeniSpace 平台信息算子

GeniSpace Platform Info 算子，用于获取 GeniSpace 平台信息，包括用户资料、团队信息和智能体列表。

## 📋 算子信息

- **名称**: genispace-info
- **分类**: platform
- **版本**: 1.0.0
- **作者**: GeniSpace AI Team

## 🚀 功能特性

### ✅ 核心功能
- ✅ 用户资料获取 - 获取当前认证用户的详细资料信息
- ✅ 用户统计信息 - 获取用户的任务、智能体、团队等统计信息
- ✅ 团队信息 - 获取用户所属的团队列表
- ✅ 智能体列表 - 获取用户可访问的智能体列表，支持分页和筛选
- ✅ GeniSpace SDK 集成 - 使用官方 SDK 与平台交互
- ✅ 认证支持 - 支持 GeniSpace 平台认证

### 🆕 算子平台集成
- ✅ OpenAPI 规范 - 完整的API文档和类型定义
- ✅ 统一响应格式 - 符合GeniSpace平台标准
- ✅ 健康检查 - 服务状态监控
- ✅ 错误处理 - 标准化错误响应

## 📡 API 接口

### 基础URL
```
http://localhost:8080/api/platform/genispace-info
```

### 1. 获取用户资料
**POST** `/user-profile`

获取当前认证用户的详细资料信息，包括用户基本信息、统计信息和团队信息。

```bash
# 基础请求
curl -X POST http://localhost:8080/api/platform/genispace-info/user-profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY"

# 自定义包含项
curl -X POST http://localhost:8080/api/platform/genispace-info/user-profile \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "includeStatistics": true,
    "includeTeams": true
  }'
```

**请求参数**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| includeStatistics | boolean | 否 | true | 是否包含统计信息 |
| includeTeams | boolean | 否 | true | 是否包含团队信息 |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "user_123",
      "email": "user@example.com",
      "name": "张三",
      "company": "示例公司",
      "createdAt": "2025-01-01T00:00:00.000Z"
    },
    "statistics": {
      "tasksCreated": 100,
      "tasksCompleted": 85,
      "agentsCount": 10,
      "teamsCount": 3
    },
    "teams": [
      {
        "id": "team_123",
        "name": "开发团队",
        "role": "admin",
        "isActive": true
      }
    ],
    "platform": {
      "authenticated": true,
      "apiKeyStatus": "valid",
      "connection": "GeniSpace SDK",
      "version": "1.0.0"
    }
  }
}
```

### 2. 获取智能体列表
**POST** `/agents`

获取当前用户可访问的智能体列表，支持分页和类型筛选。

```bash
# 基础请求
curl -X POST http://localhost:8080/api/platform/genispace-info/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY"

# 带分页和筛选
curl -X POST http://localhost:8080/api/platform/genispace-info/agents \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "page": 1,
    "limit": 20,
    "agentType": "CHAT"
  }'
```

**请求参数**:

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| page | number | 否 | 1 | 页码（最小值为1） |
| limit | number | 否 | 10 | 每页数量（1-100） |
| agentType | string | 否 | null | 智能体类型：'CHAT' 或 'TASK' |

**响应示例**:
```json
{
  "success": true,
  "data": {
    "agents": [
      {
        "id": "agent_123",
        "name": "客服助手",
        "description": "智能客服助手",
        "agentType": "CHAT",
        "model": "gpt-4",
        "createdAt": "2025-01-01T00:00:00.000Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalItems": 50,
      "itemsPerPage": 10
    }
  }
}
```

## 🔧 配置说明

### 环境变量

GeniSpace 平台信息算子需要以下环境变量配置：

#### GeniSpace 认证配置
- `GENISPACE_AUTH_ENABLED`: 是否启用 GeniSpace 认证（默认：`false`）
- `GENISPACE_API_BASE_URL`: GeniSpace API 基础URL（默认：`https://api.genispace.com`）

#### 服务器配置
- `PROTOCOL`: 协议（默认：`http`）
- `HOST`: 主机地址（默认：`localhost`）
- `PORT`: 端口号（默认：`8080`）

### 认证方式

算子支持通过以下方式认证：

1. **API Key 认证**: 在请求头中传递 `Authorization: Bearer YOUR_API_KEY`
2. **GeniSpace SDK**: 自动从请求中提取认证信息

## 📝 使用示例

### JavaScript 示例

```javascript
const axios = require('axios');

// 获取用户资料
async function getUserProfile() {
  try {
    const response = await axios.post(
      'http://localhost:8080/api/platform/genispace-info/user-profile',
      {
        includeStatistics: true,
        includeTeams: true
      },
      {
        headers: {
          'Authorization': 'Bearer YOUR_API_KEY'
        }
      }
    );
    
    console.log('用户资料:', response.data.data.user);
    console.log('统计信息:', response.data.data.statistics);
    console.log('团队列表:', response.data.data.teams);
  } catch (error) {
    console.error('获取用户资料失败:', error.response?.data || error.message);
  }
}

// 获取智能体列表
async function getAgents() {
  try {
    const response = await axios.post(
      'http://localhost:8080/api/platform/genispace-info/agents',
      {
        page: 1,
        limit: 20,
        agentType: 'CHAT'
      },
      {
        headers: {
          'Authorization': 'Bearer YOUR_API_KEY'
        }
      }
    );
    
    console.log('智能体列表:', response.data.data.agents);
    console.log('分页信息:', response.data.data.pagination);
  } catch (error) {
    console.error('获取智能体列表失败:', error.response?.data || error.message);
  }
}

getUserProfile();
getAgents();
```

### Python 示例

```python
import requests

# 获取用户资料
def get_user_profile():
    url = 'http://localhost:8080/api/platform/genispace-info/user-profile'
    headers = {
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
    }
    data = {
        'includeStatistics': True,
        'includeTeams': True
    }
    
    response = requests.post(url, json=data, headers=headers)
    
    if response.status_code == 200:
        result = response.json()
        print('用户资料:', result['data']['user'])
        print('统计信息:', result['data']['statistics'])
        print('团队列表:', result['data']['teams'])
    else:
        print('获取用户资料失败:', response.json())

# 获取智能体列表
def get_agents():
    url = 'http://localhost:8080/api/platform/genispace-info/agents'
    headers = {
        'Authorization': 'Bearer YOUR_API_KEY',
        'Content-Type': 'application/json'
    }
    data = {
        'page': 1,
        'limit': 20,
        'agentType': 'CHAT'
    }
    
    response = requests.post(url, json=data, headers=headers)
    
    if response.status_code == 200:
        result = response.json()
        print('智能体列表:', result['data']['agents'])
        print('分页信息:', result['data']['pagination'])
    else:
        print('获取智能体列表失败:', response.json())

get_user_profile()
get_agents()
```

## 🔍 注意事项

1. **认证要求**: 所有接口都需要 GeniSpace 平台认证，请确保在请求头中提供有效的 API Key
2. **错误处理**: 如果认证失败，将返回 401 错误
3. **SDK 依赖**: 算子使用 GeniSpace SDK 与平台交互，确保 SDK 正确配置
4. **数据格式**: 响应数据格式符合 GeniSpace 平台标准
5. **分页限制**: 每页最大数量为 100 条记录

## 🐛 故障排除

### 常见问题

1. **认证失败 (401)**
   - 检查 API Key 是否正确
   - 确认 `GENISPACE_AUTH_ENABLED` 配置是否正确
   - 验证 API Key 是否有效且未过期

2. **SDK 调用失败**
   - 检查 `GENISPACE_API_BASE_URL` 配置是否正确
   - 确认网络连接正常
   - 查看服务器日志获取详细错误信息

3. **数据获取失败**
   - 检查用户权限是否足够
   - 确认请求参数格式是否正确
   - 验证平台服务是否正常

## 📄 许可证

MIT License

## 👥 贡献

欢迎提交 Issue 和 Pull Request！

---

**由 GeniSpace AI Team 开发**  
*提供 GeniSpace 平台信息查询能力*

