export const agentConfig = {
  qwenKey: () => process.env['QWEN_API_KEY'] || '',
  qwenModel: () => process.env['QWEN_MODEL'] || 'qwen-plus',
  qwenBaseUrl: () =>
    process.env['QWEN_BASE_URL'] ||
    'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
};
