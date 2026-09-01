# UI Development Guide

## Quick Start

KubeOrchestra uses `orchcli` for development environment orchestration. All docker-compose and orchestration files are managed in the CLI repository.

### Prerequisites

1. Install orchcli: `npm install -g @kubeorchestra/orchcli`
2. Docker and Docker Compose installed
3. Node.js 18+ and npm installed

### Development Workflow

#### Using orchcli (Recommended)

```bash
# From the parent directory containing all repos
orchcli init         # Clone UI and Core repositories
orchcli dev start    # Start full environment (UI, Core, PostgreSQL)
orchcli dev logs     # View logs
orchcli dev stop     # Stop environment
```

#### Local UI Development

If you want to run the UI locally while using orchcli for backend services:

```bash
# Start only backend and database
orchcli dev start --ui-only

# In the ui directory
npm run dev          # Start development server on port 3001
# or
make dev            # Using Makefile
```

### Available Scripts

#### Development

- `npm run dev` - Start development server (port 3001)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run type-check` - Run TypeScript type checking
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix linting issues

#### Makefile Commands

- `make dev` - Start development server
- `make build` - Build the application
- `make check-next-app` - Run type check, lint, and build
- `make clean-install` - Clean install dependencies
- `make quick-check` - Quick type check and lint

### Project Structure

```
ui/
├── app/            # Next.js 15 app directory
├── components/     # React components
│   ├── ui/        # shadcn/ui components
│   └── custom/    # Custom components
├── lib/           # Utilities and helpers
├── hooks/         # Custom React hooks
├── services/      # API service layer
├── store/         # Zustand state management
├── styles/        # Global styles
├── public/        # Static assets
└── types/         # TypeScript type definitions
```

### Environment Variables

Create a `.env.local` file for local development:

```bash
# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000/v1/api

# Optional: Analytics, Feature Flags, etc.
NEXT_PUBLIC_GA_ID=
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

### Port Configuration

The UI runs on **port 3001** by default (configured in package.json):

- Development: `http://localhost:3001`
- API Backend: `http://localhost:3000`

### Component Development

#### Using shadcn/ui Components

```bash
# Add a new component from shadcn/ui
npx shadcn@latest add button
npx shadcn@latest add dialog
```

#### Creating Custom Components

```typescript
// components/custom/MyComponent.tsx
import { FC } from 'react';

interface MyComponentProps {
  // Props definition
}

export const MyComponent: FC<MyComponentProps> = (props) => {
  return <div>Component</div>;
};
```

### State Management

Using Zustand for state management:

```typescript
// store/workflow-store.ts
import { create } from "zustand";

interface WorkflowState {
  components: Component[];
  addComponent: (component: Component) => void;
}

export const useWorkflowStore = create<WorkflowState>(set => ({
  components: [],
  addComponent: component =>
    set(state => ({ components: [...state.components, component] })),
}));
```

### API Integration

```typescript
// services/api/templates.ts
import { apiClient } from "@/lib/api-client";

export const templatesApi = {
  getAll: () => apiClient.get("/v1/templates"),
  getById: (id: string) => apiClient.get(`/v1/templates/${id}`),
  // ... other endpoints
};
```

### Testing

```bash
# Run tests (when implemented)
npm run test

# Run tests in watch mode
npm run test:watch
```

### Building for Production

```bash
# Build the application
npm run build

# Start production server with the browser-visible Core API URL
NEXT_PUBLIC_API_URL=http://localhost:3000/v1/api npm run start
```

The standalone server reads `NEXT_PUBLIC_API_URL` from a no-store initialization
script before browser hydration. The value is not frozen into the production
bundle, so one container image can be promoted across environments without
rebuilding it. The container health check fails if the variable is missing or
invalid.

### Styling

The project uses:

- **Tailwind CSS v4** for utility-first styling
- **CSS Modules** for component-specific styles
- **shadcn/ui** for pre-built components

### Performance Optimization

- Use `next/dynamic` for code splitting
- Implement React.memo for expensive components
- Use `next/image` for optimized images
- Enable Turbopack in development: `npm run dev` (already configured)

## Troubleshooting

### Common Issues

1. **Port 3001 already in use**

   ```bash
   # Find process using port 3001
   lsof -i :3001
   # Kill the process
   kill -9 <PID>
   ```

2. **API connection issues**
   - Ensure backend is running: `orchcli dev start`
   - Check NEXT_PUBLIC_API_URL in .env.local

3. **Type errors**
   ```bash
   # Run type checking
   npm run type-check
   ```

## Why This Setup?

1. **Centralized Orchestration**: All docker-compose in CLI repo
2. **Clean Repository**: UI repo focuses only on frontend code
3. **Better Developer Experience**: Single tool (orchcli) manages environment
4. **Hot Module Replacement**: Fast refresh in development

## Need Help?

- Check the CLI repository for orchestration details
- Run `make help` for available commands
- Run `orchcli --help` for CLI commands
- View component library in Storybook (when implemented)
