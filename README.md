# chat_app_be

## Backend Setup

1. **Clone the Backend Repository:**
  ```bash
    git clone https://github.com/dela444/chat_app_be.git

    cd chat_app_be
  ```
2. **Update `package.json`:**

Open the `package.json` file and change the `name` property from:

```json
   {
    "name": "backend",
    "version": "1.0.0",
```
To:

```json
   {
    "name": "chat_app_be",
    "version": "1.0.0",
  }
```

3. **Update `package-lock.json`:**

Open the `package-lock.json` file and change the `name` property from:

```json
  {
    "name": "backend",
    "version": "1.0.0",
    "lockfileVersion": 2,
    "requires": true,
    "packages": {
      "": {
        "name": "backend",
```
To:

```json
  {
    "name": "chat_app_be",
    "version": "1.0.0",
    "lockfileVersion": 2,
    "requires": true,
    "packages": {
      "": {
        "name": "chat_app_be",
```

4. **Install Dependencies:**

  ```bash
  npm install
  ```

5. **Set Up Environment Variables:**

   Create a `.env` file in the root of the backend directory and add the following environment variables:
   
```bash
PORT=5000
JWT_SECRET=your_jwt_secret
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=your_db_user
DATABASE_PASSWORD=your_db_password
DATABASE_NAME=your_db_name
DATABASE_MAX=1000
DATABASE_TIMEOUT_MILLIS=30000
    
REDIS_HOST=your_reds_host
REDIS_PORT=your_redis_port
REDIS_PASSWORD=your_redis_password
 ``` 
6. **Start the Backend Server:**
 ```bash
  npm run dev
  ```