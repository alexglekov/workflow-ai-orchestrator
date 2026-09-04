export const agentConfig = {
  defaultProvider: () => process.env['AGENT_PROVIDER'] || 'gemini',
  geminiKey: () => process.env['GEMINI_API_KEY'] || '',
  geminiModel: () => process.env['GEMINI_MODEL'] || 'gemini-3.6-flash',
  geminiBaseUrl: () =>
    process.env['GEMINI_BASE_URL'] ||
    'https://generativelanguage.googleapis.com/v1beta',
  qwenKey: () => process.env['QWEN_API_KEY'] || '',
  qwenModel: () => process.env['QWEN_MODEL'] || 'qwen-plus',
  qwenBaseUrl: () =>
    process.env['QWEN_BASE_URL'] ||
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
};
