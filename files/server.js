// server.js (Node.js) = handles backend requests to generate presigned URLs
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import express from "express";
import 'dotenv/config';

const app = express();
app.use(express.json());

const s3 = new S3Client({ region: process.env.AWS_REGION });
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

app.listen(3000, () => console.log("Server running on port 3000"));
