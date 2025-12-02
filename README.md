# Music Streaming Platform

A complete music streaming platform with user authentication, admin panel for music uploads, Docker Compose support, and full Kubernetes deployment.

**🎯 Kubernetes Lab Assignment: COMPLETED**

This application successfully demonstrates:
- ✅ Docker containerization
- ✅ Kubernetes deployment with 2 replicas
- ✅ NodePort service configuration
- ✅ Pod scaling capabilities
- ✅ Health monitoring endpoints
- ✅ Production-ready architecture

## Features

🎵 **Music Streaming**: Stream uploaded music files  
👥 **User Authentication**: Login/Register system with JWT tokens  
🔒 **Admin Panel**: Admin users can upload music and cover images  
📱 **Responsive UI**: Modern, Spotify-inspired interface  
🐳 **Docker Support**: Full Docker Compose setup  
📊 **Metrics**: Built-in metrics and health endpoints  

## Quick Start with Docker Compose

1. **Build and run the application:**
   ```bash
   docker-compose up --build
   ```

2. **Access the application:**
   - Open http://localhost:8080 in your browser

3. **Default admin credentials:**
   - Username: `admin`
   - Password: `admin123`

## Manual Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the application:**
   ```bash
   npm start
   ```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port |
| `APP_ENV` | `local` | Application environment |
| `RELEASE` | `v2.1` | Release version |
| `JWT_SECRET` | `fallback_secret_key` | JWT signing secret |
| `ADMIN_USERNAME` | `admin` | Default admin username |
| `ADMIN_PASSWORD` | `admin123` | Default admin password |

## Usage

### For Regular Users
1. Register a new account or login with existing credentials
2. Browse and play uploaded music tracks
3. Use player controls (play, pause, next, previous, shuffle)
4. Seek through tracks using the progress bar

### For Admin Users
1. Login with admin credentials
2. Access the admin panel at the bottom of the interface
3. Upload new music tracks with optional cover images
4. Manage the music library

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration  
- `GET /api/auth/verify` - Verify JWT token

### Music
- `GET /api/tracks` - Get all tracks (authenticated)
- `GET /api/stream/{id}` - Stream music file (authenticated)
- `GET /api/cover/{id}` - Get cover image (authenticated)
- `POST /api/event` - Track play/skip events (authenticated)

### Admin
- `POST /api/admin/upload` - Upload music with cover (admin only)

### Health & Metrics
- `GET /healthz` - Health check
- `GET /readyz` - Readiness check
- `GET /metrics` - Application metrics

## File Structure

```
├── app.js              # Main application file
├── package.json        # Dependencies and scripts
├── docker-compose.yml  # Docker Compose configuration
├── Dockerfile          # Docker build configuration
├── uploads/            # Uploaded files (music & covers)
│   ├── music/         # Audio files
│   └── covers/        # Cover images
├── data/              # SQLite database
└── k8s/               # Kubernetes manifests (legacy)
```

## Database Schema

The application uses SQLite with the following tables:

### Users
- `id` (INTEGER PRIMARY KEY)
- `username` (TEXT UNIQUE)
- `password` (TEXT, bcrypt hashed)
- `is_admin` (BOOLEAN)
- `created_at` (DATETIME)

### Tracks
- `id` (TEXT PRIMARY KEY, UUID)
- `title` (TEXT)
- `artist` (TEXT)
- `filename` (TEXT)
- `cover_filename` (TEXT, optional)
- `duration` (INTEGER, seconds)
- `uploaded_by` (INTEGER, foreign key)
- `created_at` (DATETIME)

## Security Features

- 🔐 Password hashing with bcryptjs
- 🎫 JWT-based authentication with 24h expiration
- 🛡️ Admin-only upload endpoints
- 📁 File type validation (audio for music, images for covers)
- 💾 100MB file size limit
- 🚫 CORS headers configured

## Docker Compose Services

The `docker-compose.yml` includes:

- **app**: Main Node.js application
  - Port mapping: 8080:8080
  - Volume mounts for uploads and database
  - Environment variables configured
  - Automatic restart policy

## Development

To extend the application:

1. **Add new endpoints**: Extend the server request handler in `app.js`
2. **Modify UI**: Update the `renderIndexPage()` function
3. **Database changes**: Modify the database initialization in `app.js`
4. **Authentication**: Extend the JWT payload or add new user roles

## Troubleshooting

- **Port already in use**: Change the `PORT` environment variable
- **Upload fails**: Check file permissions on `uploads/` directory
- **Database errors**: Ensure `data/` directory exists and is writable
- **Authentication issues**: Verify JWT_SECRET environment variable

## Kubernetes Deployment

### Prerequisites
- Docker Desktop with Kubernetes enabled, OR
- Minikube installed and running

### Deployment Steps

1. **Build the Docker image:**
   ```bash
   docker build -t kube-lab-app:v1 .
   ```

2. **Load image into Minikube (if using Minikube):**
   ```bash
   minikube image load kube-lab-app:v1
   ```

3. **Deploy to Kubernetes:**
   ```bash
   kubectl apply -f k8s/
   ```

4. **Verify deployment:**
   ```bash
   kubectl get pods
   kubectl get svc
   kubectl get all
   ```

5. **Access the application:**
   ```bash
   # Get Minikube IP
   minikube ip
   # Access at http://<minikube-ip>:30080
   # Or use: minikube service kube-lab-service
   ```

6. **Test scaling:**
   ```bash
   kubectl scale deployment kube-lab-deployment --replicas=5
   kubectl get pods
   kubectl scale deployment kube-lab-deployment --replicas=2
   ```

7. **View logs:**
   ```bash
   kubectl logs -f deployment/kube-lab-deployment
   ```

8. **Clean up:**
   ```bash
   kubectl delete -f k8s/
   ```

## Docker Commands

```bash
# Build and run with Docker Compose
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down

# Remove volumes (reset database)
docker-compose down -v
```

## Screenshots & Testing

This application has been successfully tested with:
- ✅ Docker build and run
- ✅ Kubernetes deployment with 2 replicas
- ✅ Service exposure via NodePort (30080)
- ✅ Pod scaling (tested 2→5→2 replicas)
- ✅ Health endpoints responding
- ✅ Admin authentication working
- ✅ Music streaming functionality

## Contributing

This is an open source project. Contributions are welcome!

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License

Copyright (c) 2025 Music Streaming Platform

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.