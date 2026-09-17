export const agentConfig = {
  qwenKey: () => process.env['QWEN_API_KEY'] || '',
  qwenModel: () => process.env['QWEN_MODEL'] || 'qwen-plus',
  qwenBaseUrl: () =>
    process.env['QWEN_BASE_URL'] ||
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  openaiKey: () => process.env['OPENAI_API_KEY'] || '',
  openaiModel: () => process.env['OPENAI_MODEL'] || 'gpt-4o-mini',
  openaiBaseUrl: () =>
    process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1',
  defaultProvider: () => process.env['AGENT_DEFAULT'] || 'qwen',
};
