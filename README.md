# KubeOrch UI

[![Apache 2.0 License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![CNCF Aspiring](https://img.shields.io/badge/CNCF-Aspiring-blue.svg)](https://www.cncf.io/projects/)

Visual interface for KubeOrch - Kubernetes made simple through drag-and-drop.

## 🎯 Vision

Make Kubernetes accessible to everyone. No YAML, no complexity - just drag components, connect them visually, and deploy with one click.

## 🚀 What is KubeOrch UI?

The intuitive frontend that makes Kubernetes visual and simple:

- **Visual Workflow Canvas** - Drag and drop services, draw connections
- **150+ Components** - Pre-configured databases, apps, ML platforms
- **One-Click Plugins** - Add monitoring, logging, security instantly
- **Auto-Connection** - Services wire themselves together intelligently
- **Zero Configuration** - Everything works with smart defaults

## ✨ Key Features

- 🎨 **Drag & Drop Designer** - Visual workflow creation with connection lines
- 🔌 **Smart Connections** - Auto-detect compatible services and ports
- 📦 **Component Library** - PostgreSQL, Redis, Kafka, and 150+ more
- 🚀 **One-Click Deploy** - Transform visual design to running services
- 📊 **Real-time Logs** - Stream container logs from all services
- 🎯 **Plugin Marketplace** - Install complete stacks with one click

## 🛠️ Tech Stack

- **Framework**: Next.js 15 with TypeScript
- **UI Components**: shadcn/ui + Radix UI
- **Styling**: Tailwind CSS v4
- **Canvas**: React Flow
- **State**: Zustand
- **Real-time**: WebSocket

## 🚦 Quick Start

```bash
# Clone the repository
git clone https://github.com/KubeOrch/ui.git
cd ui

# Install dependencies
npm install

# Start development server
npm run dev
```

Open http://localhost:3001

## 📁 Project Structure

```
ui/
├── app/            # Next.js app directory
├── components/     # UI components
│   ├── canvas/     # Workflow designer
│   ├── palette/    # Component library
│   └── ui/         # Base components
├── stores/         # State management
└── lib/            # Utilities
```

## 🎨 UI Philosophy

- **Progressive Disclosure** - Show complexity only when needed
- **Smart Defaults** - Everything works out-of-the-box
- **Visual Feedback** - Instant validation and suggestions
- **Zero Configuration** - Optional advanced settings

## 🤝 Contributing

We welcome contributions! See the [contributing guide](https://github.com/KubeOrch/.github/blob/main/CONTRIBUTING.md).

## 📄 License

[Apache 2.0](LICENSE)
