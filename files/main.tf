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
resource "aws_s3_bucket_cors_configuration" "my_bucket_cors" { ##CORS configuration for S3 bucket for testing from local website
  bucket = aws_s3_bucket.appimagesbucket-1234567890.id

  cors_rule {
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = ["http://localhost:3000"] ##allowing requests only from localhost:80
    allowed_headers = ["*"]
    expose_headers  = ["ETag"]
    max_age_seconds = 3000
  }
}
##EC2 instance (simple webserver)
resource "aws_instance" "tf-web-instance" { ##giving name of instance
    ami = "ami-0361bbf2b99f46c1d" ##using Amazon Linux 2023 AMI, changing to Amazon Linux 2023 as its supported by Node.js 18
    instance_type = "t3.micro" ##declaring instance type
    subnet_id = aws_subnet.publicsubnet.id ##placing instance in public subnet
    vpc_security_group_ids = [aws_security_group.web_sg.id] ##associating security group with instance
     ##so that it can be accessed over the internet
    iam_instance_profile = aws_iam_instance_profile.ec2_instance_profile.name ##attaching instance profile to EC2 instance
    disable_api_termination = true ##enabling termination protection to prevent EC2 virtual server from being accidentally terminated
    key_name      = aws_key_pair.ec2_key.key_name ##associating key pair to allow SSH access to instance

##git commit -m "Attach key pair to EC2 instance for SSH access, changed user data script to install Node.js application instead of static HTML page hosting,
##and changed AMI to Amazon Linux 2023 for Node.js 18 support"

    tags = {
        Name        = "tf-web-instance"
    }
    
    ##installing and configuring Node.js application using user data script which is different to static HTML page hosting via Apache
    user_data =  <<-EOF
     #!/bin/bash
dnf update -y

# Install Git
dnf install git -y

curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
dnf install -y nodejs


# -------------------------------
# Install PM2 correctly for ec2-user
# -------------------------------
sudo su - ec2-user <<'EOT'
# Create user-local npm global directory
mkdir -p ~/.npm-global
npm config set prefix '~/.npm-global'

# Add it to PATH permanently
echo 'export PATH=$HOME/.npm-global/bin:$PATH' >> ~/.bashrc
export PATH=$HOME/.npm-global/bin:$PATH

# Install PM2 globally
npm install -g pm2
EOT

# Create app directory
APP_DIR=/home/ec2-user/myapp
mkdir -p $APP_DIR
chown ec2-user:ec2-user $APP_DIR

cd $APP_DIR

# Clone or pull the latest code from GitHub
REPO_URL="https://github.com/chrise3435/CloudProject1.git"
if [ -d "$APP_DIR/.git" ]; then
    cd $APP_DIR
    git pull
else
    git clone $REPO_URL $APP_DIR
fi
# Ensure package.json has type: module
cat <<EOT > package.json
{
  "name": "myapp",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js"
  }
}
EOT

# -------------------------------
# Install Node dependencies
# -------------------------------
# Switch to ec2-user to ensure npm uses correct permissions
sudo su - ec2-user <<'EOT'
cd /home/ec2-user/myapp
npm install
EOT

# -------------------------------
# Start app with PM2
# -------------------------------
sudo su - ec2-user <<'EOT'
cd /home/ec2-user/myapp
# Kill any old PM2 processes to avoid caching issues
pm2 delete all || true
pm2 start server.js --name myapp
pm2 save
pm2 startup systemd -u ec2-user --hp /home/ec2-user
EOT

EOF
}

##
##           user_data = <<-EOF
##            #!/bin/bash
##            yum update -y
##            yum install -y httpd
##            systemctl start httpd
##            systemctl enable httpd
##            echo "${file("${path.module}/homepage.html")}" > /var/www/html/homepage.html 
##            EOF 
##}



##creating subnet group for RDS instance
resource "aws_db_subnet_group" "rds_subnet_group" { 
  name       = "websitedatabasesubnetgroup"
  subnet_ids = var.subnet_ids

  tags = {
    Name = "websitedatabasesubnetgroup"
  }
}
##creating the rds database instance
resource "aws_db_instance" "mydbinstance" {   
   allocated_storage    = 20
       engine               = "mysql"
       engine_version       = "8.0"
       instance_class       = "db.t3.micro"
       db_name              = "websitedatabase"
       username             = var.db_username
       password             = var.db_password
       parameter_group_name = "default.mysql8.0"
       skip_final_snapshot  = true
       vpc_security_group_ids = [aws_security_group.rds_sg.id] ##associating RDS security group to allow access from EC2 instance
       db_subnet_group_name = aws_db_subnet_group.rds_subnet_group.name ##ensuring RDS instance is created in the specified subnets
       tags = {
           Name = "websitedatabase"
       }
       multi_az =  false   
       availability_zone = var.availability_zone
       publicly_accessible = false
       
   }
