// server.js (Node.js) = handles backend requests to generate presigned URLs 
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import express from "express";
import cors from "cors";
import 'dotenv/config';
import path from "path";
import { fileURLToPath } from "url";
import fs from 'fs';
import session  from "express-session"; 

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


// pool to contain cache of database connections, this is to improve performance by reusing existing connections instead of creating new ones for each request
const pool = new Pool({
  host: process.env.DB_HOST,        
  user: process.env.DB_USER,        
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,    
  port: 3306  ,
  ssl: {
    ca: fs.readFileSync('./certs/global-bundle.pem') // Path to the CA certificate bundle for RDS SSL connection to ensure secure database connection
  },
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
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
app.listen(3000, "0.0.0.0", () => console.log("Server running on port 3000"));
