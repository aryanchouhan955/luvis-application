# LUVIS - Live User Virtual Interaction System 🚀

A real-time collaborative learning platform featuring virtual study rooms, shared whiteboard, code editor, and competitive challenges.

[![Live Demo](https://img.shields.io/badge/Live_Demo-Access_Here-success?style=for-the-badge)](https://luvis-application1.netlify.app)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-B73BFE?style=for-the-badge&logo=vite&logoColor=FFD62E)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-181818?style=for-the-badge&logo=supabase&logoColor=green)](https://supabase.io/)

## 🌐 Live Application

Experience the live application here: **[https://luvis-application1.netlify.app](https://luvis-application1.netlify.app)**

## 📖 About The Project

LUVIS (Live User Virtual Interaction System) is a comprehensive web application built to enhance remote learning and collaboration. It provides an interactive space for users to study together, solve coding challenges, and share ideas in real-time.

### ✨ Key Features

*   **👥 Virtual Study Rooms:** Create or join rooms to collaborate with peers in a distraction-free environment.
*   **💻 Code Editor:** Real-time collaborative IDE powered by Monaco Editor and Yjs for pair programming and coding challenges.
*   **🏆 Competitive Challenges:** Participate in coding challenges and track your progress against others.
*   **🎨 Shared Whiteboard:** Interactive shared spaces to brainstorm and draw concepts together.
*   **🔐 Authentication:** Secure user sign-up and login infrastructure powered by Supabase.

## 🛠️ Built With

This project leverages modern web technologies to ensure a fast, responsive, and highly scalable experience:

*   **Frontend Framework:** [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
*   **Styling:** [Tailwind CSS](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/)
*   **Backend, Auth & Database:** [Supabase](https://supabase.com/) (Auth, PostgreSQL, Realtime)
*   **State Management:** [React Query](https://tanstack.com/query/latest)
*   **Real-time Collaboration:** Yjs + Monaco Editor
*   **Routing:** React Router v6

## 🚀 Getting Started

To get a local copy up and running, follow these simple steps.

### Prerequisites

*   Node.js (v18 or higher recommended)
*   npm

### Installation

1.  Clone the repository:
    ```bash
    git clone https://github.com/your-username/luvis-application.git
    ```
2.  Navigate to the project directory:
    ```bash
    cd luvis-application
    ```
3.  Install NPM packages:
    ```bash
    npm install
    ```
4.  Set up environment variables:
    *   Create a `.env` file in the root directory.
    *   Add your Supabase credentials to connect to your project:
        ```env
        VITE_SUPABASE_URL=your_supabase_url
        VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
        ```
5.  Start the development server:
    ```bash
    npm run dev
    ```

## 🤝 Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📄 License

Distributed under the MIT License. See `LICENSE` for more information.
