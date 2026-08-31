export const agentConfig = {
  defaultProvider: () => process.env['AGENT_PROVIDER'] || 'gemini',
  geminiKey: () => process.env['GEMINI_API_KEY'] || '',
  geminiModel: () => process.env['GEMINI_MODEL'] || 'gemini-3.6-flash',
  geminiBaseUrl: () =>
    process.env['GEMINI_BASE_URL'] ||
    'https://generativelanguage.googleapis.com/v1beta',
  openaiKey: () => process.env['OPENAI_API_KEY'] || '',
  openaiModel: () => process.env['OPENAI_MODEL'] || 'gpt-4o-mini',
  openaiBaseUrl: () =>
    process.env['OPENAI_BASE_URL'] || 'https://api.openai.com/v1',
};
