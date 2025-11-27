terraform {
    required_version = ">= 1.0.0"
    required_providers {
        aws = {
            source  = "hashicorp/aws"
            version = "~> 4.0"
        }
        random = {
            source  = "hashicorp/random"
            version = "~> 3.0"
        }
        tls = {
            source  = "hashicorp/tls"
            version = "~> 4.0"
        }
    }
}

provider "aws" { ##declaring the cloud platform provider that we will use terraform to create infrastructure for
    region = "ap-southeast-2"
}
# Find latest Amazon Linux 2 AMI
data "aws_ami" "amazon_linux_2" {
    most_recent = true
    owners      = ["amazon"]

    filter {
        name   = "name"
        values = ["amzn2-ami-hvm-*-x86_64-gp2"]
    }
}

# S3 bucket 

resource "aws_s3_bucket" "appimagesbucket-1234567890" { 
    bucket = "appimagesbucket-1234567890" ##declaring name for the bucket
    acl    = "private"

    versioning {
        enabled = true ##enabling versioning for the bucket
    }

    force_destroy = true

    tags = {
        Name        = "appimagesbucket-1234567890"
    }
}

resource "aws_s3_bucket_cors_configuration" "my_bucket_cors" { ##CORS configuration for S3 bucket
  bucket = aws_s3_bucket.appimagesbucket-1234567890.id

  cors_rule {
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = ["http://localhost:3000"] ##allowing requests only from localhost:3000
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}

# EC2 instance (simple webserver)
resource "aws_instance" "tf-web-instance" { ##giving name of instance
    ami                    = data.aws_ami.amazon_linux_2.id
    instance_type          = "t2.micro" ##declaring instance type
    disable_api_termination = true ##enabling termination protection to prevent EC2 virtual server from being accidentally terminated

    
    tags = {
        Name        = "tf-web-instance"
    }

             user_data = <<-EOF
              #!/bin/bash
              yum update -y
              yum install -y httpd
              systemctl start httpd
              systemctl enable httpd
              echo "${file("${path.module}/homepage.html")}" > /var/www/html/homepage.html 
              EOF 
          ##file() reads contents of a file from  and inserts it into user data script
                 ##using user data to install and start apache web server and deploy a simple html page on EC2 instance
}
 