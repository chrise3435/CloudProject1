
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
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ filename: file.name, filetype: file.type })
        });

        console.log('Response from server:', response);

        if (!response.ok) {
            throw new Error('Failed to get presigned URL');
        }

        const { url, key } = await response.json(); // Get the presigned URL and key

        // Upload the file to S3 directly using the presigned URL
        const s3Response = await fetch(url, {
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

