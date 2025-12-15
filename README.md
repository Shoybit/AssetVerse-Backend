# 🚀 AssetVerse Backend — Asset Management API

## 📋 Project Overview

**AssetVerse Backend** is a RESTful API built to support the AssetVerse frontend application.  
It handles asset management, categories, authentication, and data persistence using a scalable and secure server-side architecture.

---

## 🌐 Related Links

- **Frontend Live:** https://my-assetverse.vercel.app/
- **Frontend Repo:** https://github.com/Shoybit/AssetVerse
- **Backend Repo:** https://github.com/Shoybit/AssetVerse-Backend

---

## ✨ Key Features

- 🔐 Authentication & Authorization
- 🗂️ Asset CRUD operations
- 🏷️ Category & tag management
- 🔍 Search & filtering support
- 📊 Data aggregation for dashboards
- 🧾 Secure REST API endpoints
- 🌍 CORS enabled for frontend access

---

## 🛠️ Tech Stack

- **Node.js** — Runtime environment
- **Express.js** — Web framework
- **MongoDB** — NoSQL database
- **Mongoose** — MongoDB ODM
- **JWT** — Authentication
- **dotenv** — Environment variables
- **cors** — Cross-origin support

---

## 📦 npm Packages Used

```
express
mongoose
jsonwebtoken
dotenv
cors
bcryptjs
nodemon
```

> Refer to `package.json` for exact versions.

---

## 🚀 Installation & Setup

### Prerequisites
- Node.js v18.x or higher
- npm or yarn
- MongoDB (local or cloud)

---

### Installation Steps

1. **Clone the repository**
```bash
git clone https://github.com/Shoybit/AssetVerse-Backend.git
cd AssetVerse-Backend
```

2. **Install dependencies**
```bash
npm install
# or
yarn install
```

3. **Create environment variables**

Create a `.env` file in the root directory:

```env
PORT=5000
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
```

4. **Run the server**
```bash
npm run dev
# or
npm start
```

Server will run at:
```
http://localhost:5000
```

---

## 📁 Project Structure

```
AssetVerse-Backend/
├── src/
│   ├── controllers/   # Request handlers
│   ├── models/        # Mongoose schemas
│   ├── routes/        # API routes
│   ├── middlewares/   # Auth & error handling
│   ├── utils/         # Utility functions
│   └── server.js      # Server entry point
├── .env
├── package.json
├── nodemon.json
└── README.md
```

---

## 🔐 API Base URL

```
http://localhost:5000/api
```

Example:
```
GET /api/assets
POST /api/assets
```

---

## 📄 License

This project is licensed under the **MIT License**.
