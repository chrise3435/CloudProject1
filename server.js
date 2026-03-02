// server.js (Node.js) = handles backend requests to generate presigned URLs 
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import express from "express";
import cors from "cors";
import 'dotenv/config';
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { SecretsManagerClient, GetSecretValueCommand } 
  from "@aws-sdk/client-secrets-manager";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const corsOptions = {
  origin: 'http://localhost:3000',
  optionsSuccessStatus: 200,
}; 
app.use(cors(corsOptions)); 
app.use(express.json());
app.use(express.static('files')); // this is to ensure server can show files from files folder, so when server starts all the files in 'files folder' will run
import { Pool } from 'pg'; //this is for the connection pool to the database, it allows us to manage multiple connections to the database efficiently by reusing existing connections instead of creating new ones for each request
import bcrypt from 'bcrypt'; // bcrypt is used for hashing passwords before storing them in the database for security
let pool;

async function getDbCredentials() { //this function gets the db credentials from AWS Secrets Manager, this is to ensure that the database credentials are not hardcoded in the code and are securely stored in AWS Secrets Manager, ensuring that the system won't break upon server startup due to missing environment variables, and also allows for easier management of credentials without needing to change the code

  const client = new SecretsManagerClient({ region: "ap-southeast-2" }); // Create a Secrets Manager client, this is used to interact with AWS Secrets Manager to retrieve the database credentials
  const response = await client.send(
    new GetSecretValueCommand({
      SecretId: "rds_credentials"
    })
  );

  return JSON.parse(response.SecretString);
}
async function initializeDbconnection() { //this function initializes the database connection pool using the credentials retrieved from AWS Secrets Manager, this is called when the server starts to ensure that the database connection is established and ready to handle requests
  const credentials = await getDbCredentials();

  pool = new Pool({
    host: credentials.host,
    user: credentials.username,
    password: credentials.password,
    database: credentials.database,
    port: credentials.port,
    ssl:  { ca: fs.readFileSync(path.join(__dirname, "global-bundle.pem")).toString() }, // this is to ensure that the connection to the database is secure by using SSL and providing the CA certificate for verification
      waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
  });

  console.log("Database connected TO :", credentials.host, "Under username : ", credentials.username);

}

//setting the default page which is login, this means the page that first shows up when the user opens webapp  
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "files", "loginpage.html"));
});

app.get("/homepage.html", requireLogin, (req, res) => { // this is to ensure only logged in users can access the homepage, if they are not logged in they will be redirected to the login page
  res.sendFile(path.join(__dirname, "files", "homepage.html"));
});

app.get("/createaccount.html", (req, res) => {
  res.sendFile(path.join(__dirname, "files", "createaccount.html"));
});
app.post("/get-presigned-url", async (req, res) => {
  try {
    const fileName = req.body.fileName;
    const fileType = req.body.fileType;

    const command = new PutObjectCommand({
      Bucket: "appimagesbucket-1234567890",
      Key: fileName,
      ContentType: fileType,
    });

    const uploadURL = await getSignedUrl(s3, command, { expiresIn: 3600 });

    res.json({ uploadURL });
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating URL");
  }
});



// logic for handling a user login request, this function is called when a user attempts to log in to the webapp
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const result = await pool.query('SELECT password FROM users WHERE username=$1', [username]);
    
    if(result.rows.length === 0){
      return res.json({ success: false, message: "User not found" });
    }

    const storedHash = result.rows[0].password;
    const match = await bcrypt.compare(password, storedHash);

    if(match){
        req.session.userId = result.rows[0].id;
        req.session.userName = username;

      res.json({ success: true });


    } else {
      res.json({ success: false, message: "Incorrect password" });
    }

  } catch(err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});
//
//// user account creation logic, this function is called when a user signs up to the web app
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Check if user exists
    const exists = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    if (exists.rows.length > 0) {
      return res.json({ success: false, message: "Username already exists" });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert into database
    await pool.query('INSERT INTO users(username, password) VALUES($1, $2)', [username, hashedPassword]);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.redirect('/loginpage.html'); // send them to login page
  }
  next();
}

async function startServer() {
  await initializeDbconnection(); // Initialize the database connection before starting the server
app.listen(3000, "0.0.0.0", () => console.log("Server running on port 3000"));
}

startServer(); // Start the server after initializing the database connection