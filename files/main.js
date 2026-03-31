
//frontend JS referenced by your HTML

// Handle the file upload form submission
// main.js
console.log("main.js loaded");

document.addEventListener("DOMContentLoaded", () => {
  console.log("DOM fully loaded");


  //-- CREATE ACCOUNT LOGIC --
  // --------- CREATE ACCOUNT LOGIC ----------
  const backToLoginBtn = document.getElementById("backToLoginBtn");
  const registerBtn = document.getElementById("registerBtn");

  if (backToLoginBtn) {
    backToLoginBtn.addEventListener("click", () => {
      window.location.href = "loginpage.html";
    });
    console.log("Back to Login button listener attached");
  }

  if (registerBtn) {
    registerBtn.addEventListener("click", async () => {
      const username = document.getElementById("newUsername").value;
      const email = document.getElementById("email").value;
      const password = document.getElementById("newPassword").value;
      const confirm = document.getElementById("confirmPassword").value;
      const message = document.getElementById("message");

      console.log("User to create:", { username, email, password });

      if (!username || !email || !password || !confirm) {
        alert("Please fill in all fields");
        return;
      }

      if (password !== confirm) {
        message.textContent = "Passwords do not match!";
        message.style.color = "red";
        return;
      }

      message.textContent = "Creating account...";
      message.style.color = "black";

      try {
        const response = await fetch("/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, email, password })
        });

        const data = await response.json();

        if (data.success) {
          message.textContent = "Account created successfully!";
          message.style.color = "green";
        } else {
          message.textContent = data.message || "Failed to create account";
          message.style.color = "red";
        }
      } catch (err) {
        console.error("Account creation error:", err);
        message.textContent = "Server error. Please try again.";
        message.style.color = "red";
      }
    });
    console.log("Register button listener attached");
  }
  // --------- FILE UPLOAD LOGIC ----------
  const fileInput = document.getElementById('file-input');
  const uploadForm = document.getElementById('upload-form');

  if (fileInput) {
    fileInput.addEventListener('change', (e) => {
      console.log('Selected file:', e.target.files[0]);
    });
    console.log("File input listener attached");
  }

  if (uploadForm) {
    uploadForm.addEventListener('submit', async (event) => {
      event.preventDefault();

      const file = fileInput.files[0];
      const messageEl = document.getElementById('message');

      if (!file) {
        alert('Please select a file first!');
        return;
      }

      messageEl.textContent = 'Uploading...';

      try {
        const response = await fetch('/get-presigned-url', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: file.name, fileType: file.type })
        });

        if (!response.ok) throw new Error('Failed to get presigned URL');

        const { uploadURL } = await response.json();
        console.log('Upload URL:', uploadURL);

        const s3Response = await fetch(uploadURL, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file
        });

        if (s3Response.ok) {
          messageEl.textContent = 'File uploaded successfully!';
        } else {
          throw new Error('Error uploading file to S3');
        }
      } catch (err) {
        console.error('Upload error:', err);
        messageEl.textContent = 'Error uploading file. Please try again.';
      }
    });
    console.log("Upload form listener attached");
  }
});



  // --------- LOGIN LOGIC ----------
  const loginBtn = document.getElementById('loginBtn');
  const createBtn = document.getElementById('createAccountBtn');

  if (loginBtn) {
    loginBtn.addEventListener('click', loginUser);
    console.log("Login button listener attached");
  }

  if (createBtn) {
    createBtn.addEventListener('click', () => {
      window.location.href = 'createaccount.html';
    });
    console.log("Create Account button listener attached");
  }

// --------- LOGIN FUNCTION ----------

async function loginUser() {
  console.log('Login button clicked');

  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
    console.log('Username:', username, 'Password:', password);

  const messageEl = document.getElementById('message');

  if (!username || !password) {
    alert("Please enter both username and password");
    return;
  }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const result = await response.json();

    if (result.success) {
      messageEl.style.color = 'green';
      messageEl.innerText = "Login successful!";
      window.location.href = result.redirect; //this will ensure user gets auto redirected to the homepage after a successful login
    } else {
      messageEl.style.color = 'red';
      messageEl.innerText = result.message;
    }
  } catch (err) {
    console.error("Login error:", err);
  }
}