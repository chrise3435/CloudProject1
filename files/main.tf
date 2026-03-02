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


    tags = {
        Name        = "tf-web-instance"
    }
    ##difference in below script is it get me to install pm2 as ec2 user rather than root user
  user_data = <<-EOF
#!/bin/bash
set -e

# ------------------------------------
# System update + tools
# ------------------------------------
dnf update -y
dnf install -y git curl

# ------------------------------------
# Install Node.js 18
# ------------------------------------
curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -
dnf install -y nodejs

# ------------------------------------
# ------------------------------------
# Setup npm global directory for ec2-user
# ------------------------------------
NPM_GLOBAL_DIR=/home/ec2-user/.npm-global

mkdir -p $NPM_GLOBAL_DIR
chown -R ec2-user:ec2-user $NPM_GLOBAL_DIR

runuser -l ec2-user -c "npm config set prefix $NPM_GLOBAL_DIR"

echo "export PATH=$NPM_GLOBAL_DIR/bin:\$PATH" >> /home/ec2-user/.bashrc

# ------------------------------------
# Install PM2 (as ec2-user)
# ------------------------------------
runuser -l ec2-user -c "
  export PATH=$NPM_GLOBAL_DIR/bin:\$PATH
  npm install -g pm2
"

# ------------------------------------
# Clone app repo
# ------------------------------------
APP_DIR=/home/ec2-user/myapp
REPO_URL="https://github.com/chrise3435/CloudProject1.git"

mkdir -p $APP_DIR
chown ec2-user:ec2-user $APP_DIR

if [ -d "$APP_DIR/.git" ]; then
runuser -l ec2-user -c "cd \"$APP_DIR\" && git reset --hard && git pull origin main"
else
  runuser -l ec2-user -c "git clone $REPO_URL $APP_DIR"
fi

# ------------------------------------
# Install dependencies
runuser -l ec2-user -c "
  export PATH=$NPM_GLOBAL_DIR/bin:\$PATH
  cd $APP_DIR
  npm install
    # Download the RDS global CA bundle
  wget https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

  # Ensure correct ownership (important!)
  chown ec2-user:ec2-user global-bundle.pem
  chmod 644 global-bundle.pem

"

# ------------------------------------
# Start app with PM2
# ------------------------------------
runuser -l ec2-user -c "
  export PATH=$NPM_GLOBAL_DIR/bin:\$PATH
  cd $APP_DIR
  pm2 start server.js --name myapp
  pm2 save
"

# ------------------------------------
# Enable PM2 startup on reboot (CRITICAL)
# ------------------------------------
# ------------------------------------
# Enable PM2 startup on reboot
# ------------------------------------
export PATH=$NPM_GLOBAL_DIR/bin:$PATH
pm2 startup systemd -u ec2-user --hp /home/ec2-user



EOF
}
 

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



