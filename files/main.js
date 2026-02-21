
//frontend JS referenced by your HTML

// Handle the file upload form submission

document.getElementById('file-input').addEventListener('change', (e) => {
    console.log('This is the file you want to upload:', e.target.files[0]);
}); //checking if site is getting the file input before the user uploads

document.getElementById('upload-form').addEventListener('submit', async function (event) { //this function runs when the Upload button is clicked
    event.preventDefault(); // Prevent the default form submission

    const fileInput = document.getElementById('file-input');
    const file = fileInput.files[0]; // Get the selected file

    if (!file) {
        alert('Please select a file first!');
        return;
    }

    // Show a loading message
    document.getElementById('message').textContent = 'Uploading...';

    try {
        // Make a request to the backend to get a presigned URL for S3
        const response = await fetch('/get-presigned-url', {
            method: 'POST',
            credentials: 'include', // 🔴 REQUIRED

            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fileName: file.name, fileType: file.type })
        });

        console.log('Response from server:', response);
        console.log('Presigned URL:', response.url); //adding log to see the presigned URL

        if (!response.ok) {
            throw new Error('Failed to get presigned URL');
        }

        const { uploadURL } = await response.json(); // Get the presigned URL
        //const { url, key } = await response.json(); // Get the presigned URL and key
        //console.log('Presigned URL real :', url); //adding log to see the presigned URL

        console.log('Upload URL:', uploadURL); // Log the upload URL, this shows the URL to upload to S3
        
        // Upload the file to S3 directly using the presigned URL
        const s3Response = await fetch(uploadURL, {
            method: 'PUT',
            headers: {
                'Content-Type': file.type
            },
            body: file
        });

        if (s3Response.ok) {
            document.getElementById('message').textContent = 'File uploaded successfully!';
        } else {
            throw new Error('Error uploading file to S3');
        }
    } catch (error) {
        console.error('Upload error:', error);
        document.getElementById('message').textContent = 'Error uploading file. Please try again.';
    }
});

// Handle the login form submission
document.getElementById('loginBtn').addEventListener('click', loginUser);
document.getElementById('createAccountBtn').addEventListener('click', () => {
  window.location.href = 'createaccount.html';
});


async function loginUser() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  if (!username || !password) {
    alert("Please enter both username and password");
    return;
  }

  const response = await fetch('/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  const result = await response.json();

  if(result.success){
    document.getElementById('message').style.color = 'green';
    document.getElementById('message').innerText = "Login successful!";
  } else {
    document.getElementById('message').style.color = 'red';
    document.getElementById('message').innerText = result.message;
  }
}