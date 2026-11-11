# Developer Ascend 🚀

> Level up your GitHub presence, automate achievement badges, discover standout repositories, and grow within an authentic developer community.

---

## 🌟 Key Features

### 1. 🏆 GitHub Achievement Badge Automation
Automate the workflows required to unlock official GitHub profile badges in a transparent, developer-friendly way:
- **Quickdraw**: Create and merge a pull request within 5 minutes.
- **YOLO**: Merge a pull request without code review.
- **Pull Shark**: Progressive pull request generation and merges (Tiers: 2, 16, 128).
- **Pair Extraordinaire**: Co-authored pull request commits with git trailers.

### 2. ⭐ Repository Showcase & Discovery
- Submit public repositories with custom pitches and descriptions.
- Discover high-quality open-source projects created by peers.
- Star discovery feed with built-in daily quotas and activity leaderboards.

### 3. 🤝 Developer Networking & Follower Discovery
- Card-based developer discovery feed (*Skip* or *Follow*).
- Build mutual, authentic connections across the open-source ecosystem.
- Controlled daily follow rate limits (10/day) to prevent spam and adhere to GitHub API guidelines.

### 4. 🛡️ Safe & Secure Onboarding
- GitHub OAuth integration with server-side token validation.
- No personal access tokens (PAT) required from users.
- Automated community support gate (repository star and maintainer follow verification).

---

## 🛠️ Tech Stack

- **Framework**: [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/)
- **Styling**: [Tailwind CSS 4](https://tailwindcss.com/), [Lucide React](https://lucide.dev/)
- **Database & ORM**: [Prisma ORM](https://www.prisma.io/), PostgreSQL ([Neon](https://neon.tech))
- **Deployment**: Vercel Serverless Functions

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL database (e.g. Neon or Vercel Postgres)
- GitHub OAuth App credentials

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/SIMARSINGHRAYAT/Developer-Ascend.git
   cd Developer-Ascend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env` and fill in your credentials:
   ```env
   DATABASE_URL="postgresql://user:password@host/dbname"
   GITHUB_CLIENT_ID="your_client_id"
   GITHUB_CLIENT_SECRET="your_client_secret"
   GITHUB_REDIRECT_URI="http://localhost:5173/api/auth/github/callback"
   SUPPORT_REPO_OWNER="SIMARSINGHRAYAT"
   SUPPORT_REPO_NAME="Developer-Ascend"
   SUPPORT_MAINTAINER="SIMARSINGHRAYAT"
   ```

4. Push the Prisma database schema:
   ```bash
   npx prisma db push
   ```

5. Start the local development server:
   ```bash
   npm run dev
   ```

---

## 📄 License
MIT © Developer Ascend
