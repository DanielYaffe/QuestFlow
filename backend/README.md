# Fullstack Assignment 2

This is a REST API for a simple blog application for Fullstack assignment for colman, built with Node.js, Express, and MongoDB.

## Features

- **Authentication**: User registration, login, logout, and refresh token mechanisms using JWT.
- **Posts & Comments**: Create, read, update, and delete posts and comments.
- **Swagger Documentation**: Interactive API documentation.
- **Testing**: Comprehensive tests using Jest and Supertest.

## Getting Started

1.  **Install dependencies**:
    ```bash
    npm install
    ```

2.  **Environment Setup**:
    - Create a `.env` file in the root directory (copy from `.env.example`).
    - Set `PORT` (default 3000) and `DATABASE_URL`.
    - Set `JWT_SECRET` and `JWT_REFRESH_SECRET` for authentication.

3.  **Run the server**:
    - Development: `npm run dev`
    - Production: `npm start`

## API Documentation

- **Swagger UI**: Visit `http://localhost:<PORT>/api-docs` to view and interact with the API documentation.

## API Endpoints Overview

### Authentication
- `POST /auth/register`: Register a new user.
- `POST /auth/login`: Login user.
- `POST /auth/refresh`: Refresh access token.
- `POST /auth/logout`: Logout user.

### Posts
- `GET /posts`: Get all posts.
- `GET /posts/:id`: Get a post by ID.
- `POST /posts`: Create a new post.
- `PUT /posts/:id`: Update a post by ID.

### Comments
- `GET /comments`: Get all comments.
- `GET /comments/:id`: Get a comment by ID.
- `POST /comments`: Create a new comment.
- `PUT /comments/:id`: Update a comment by ID.
- `DELETE /comments/:id`: Delete a comment by ID.

### Users
- `GET /users`: Get user details.
- `GET /users/:id`: Get user by ID.
- `PUT /users/:id`: Update user details.

## Testing

### Automated Tests
Run the Jest test suite:
```bash
npm run test
```

### Manual Testing
Use the `request.rest` file with the VS Code REST Client extension to test the endpoints manually.