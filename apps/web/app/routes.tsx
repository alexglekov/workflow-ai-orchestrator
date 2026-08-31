import { type RouteConfig, index, route } from '@react-router/dev/routes';

export default [
  index('./routes/home.tsx'),
  route('connectors', './routes/connectors.tsx'),
  route('workflows', './routes/workflows.tsx'),
  route('workflows/:id', './routes/workflow-detail.tsx'),
  route('runs/:id', './routes/run-detail.tsx'),
] satisfies RouteConfig;
