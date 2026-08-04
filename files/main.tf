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

resource "aws_s3_bucket" "appimagesbucket-12345678901" { 
    bucket = "appimagesbucket-12345678901" ##declaring name for the bucket
    acl    = "private"

    versioning {
        enabled = true ##enabling versioning for the bucket
    }

    force_destroy = true

    tags = {
        Name        = "appimagesbucket-12345678901"
    }
}
resource "aws_s3_bucket_cors_configuration" "my_bucket_cors" { ##CORS configuration for S3 bucket for testing from local website
  bucket = aws_s3_bucket.appimagesbucket-12345678901.id

  cors_rule {
    allowed_methods = ["GET", "PUT", "POST", "DELETE"]
    allowed_origins = [  "http://${aws_eip.app_eip.public_ip}:3000" ##also planning on using EC2's elastic IP in the CORS configuration in order for S3 bucket to communicate with EC2 without hardcoding the IP. Note: A Route 53 domain name is preferred, but due to account restrictions, an Elastic IP is used as a workaround for a stable EC2-to-S3 connection.
                       ]  
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
    #key_name      = aws_key_pair.ec2_key.key_name ##associating key pair to allow SSH access to instance


    tags = {
        Name        = "tf-web-instance"
    }
    ##difference in below script is it get me to install pm2 as ec2 user rather than root user
  user_data = <<-EOF
  #!/bin/bash
  #set -e

# ------------------------------------
# System update + tools
# ------------------------------------
dnf update -y
dnf install -y git curl wget

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

mkdir -p $NPM_GLOBAL_DIR #this line creates the npm global directory if it doesn't already exist. This is important because npm will install global packages into this directory, and if the directory doesn't exist, the npm install command will fail.
chown -R ec2-user:ec2-user $NPM_GLOBAL_DIR #this changes the ownership of the npm global directory to the ec2-user user and group, which is important for security and access control. This ensures that only the ec2-user user can modify the contents of this directory, preventing unauthorized users from installing or modifying global npm packages.

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
# Clone app repo from github repo
# ------------------------------------
APP_DIR=/home/ec2-user/myapp
REPO_URL="https://github.com/chrise3435/CloudProject1.git"

mkdir -p $APP_DIR # this line creates the app directory in the EC2 server if it doesn't already exist. This is important because the app will be cloned into this directory, and if the directory doesn't exist, the git clone command will fail.
chown ec2-user:ec2-user $APP_DIR # this is to change the owner of the app directory to the ec2-user user and e2-user group so that the ec2-user user can access and modify the files in the app directory. This is important because the app will be run as the ec2-user user, and if the ownership of the app directory is not set correctly, the app may not be able to access its own files, leading to errors or unexpected behavior.

if [ -d "$APP_DIR/.git" ]; then
runuser -l ec2-user -c "cd \"$APP_DIR\" && git reset --hard && git pull origin main"
else
  runuser -l ec2-user -c "git clone $REPO_URL $APP_DIR" ## this line clones the app repo from github repo to the app directory in the EC2 server. This is important because the app needs to be downloaded from the github repo in order to be run on the EC2 server as the app contains server side code that needs to be executed on the EC2 server. If the app is not cloned from the github repo, the EC2 server will not have the necessary files to run the app, leading to errors or unexpected behavior. 
fi

# ------------------------------------
# Install dependencies
runuser -l ec2-user -c "
  export PATH=$NPM_GLOBAL_DIR/bin:\$PATH
  cd $APP_DIR ## this line navigates to the app directory in the EC2 server so that the npm dependencies can be installed in the /home/ec2-user/app location
  npm install
    # Download the RDS global CA bundle
  wget -O global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem

  # Ensure correct ownership (important!)
  chown ec2-user:ec2-user global-bundle.pem #this assigns the ownership of the .pem file to the ec2-user user and group, which is important for security and access control.
  chmod 644 global-bundle.pem #this is used to modify the permissions of the .pem file to give read/write permissions only to the user that owns the file and assings only read permissions to the group and others. This is important for security, as it prevents unauthorized users from modifying the file.

"

# ------------------------------------
# Start app with PM2
# ------------------------------------
runuser -l ec2-user -c "
  export PATH=$NPM_GLOBAL_DIR/bin:\$PATH
  cd $APP_DIR  ## this line navigates to the app directory in the EC2 server so the server can be booted up from the same location as where the dependencies were installed. This is important because the server may rely on relative paths to access its dependencies, and if it is started from a different location, it may not be able to find them, leading to errors or unexpected behavior. 
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
pm2 startup systemd -u ec2-user --hp /home/ec2-user --silent
runuser -l ec2-user -c "pm2 save"


    # ------------------------------------
    # Auto-update script on reboot
    # ------------------------------------
    cat << 'SCRIPT' > /home/ec2-user/reboot-update.sh
    #!/bin/bash
    export PATH=/home/ec2-user/.npm-global/bin:$PATH
    APP_DIR=/home/ec2-user/myapp
    cd $APP_DIR
    git reset --hard
    git pull origin main
    npm install
    pm2 restart myapp || pm2 start server.js --name myapp
    pm2 save
SCRIPT

    chmod +x /home/ec2-user/reboot-update.sh
    (crontab -l -u ec2-user 2>/dev/null; echo "@reboot /home/ec2-user/reboot-update.sh") | crontab -u ec2-user -
EOF
}
 

##creating subnet group for RDS instance
##resource "aws_db_subnet_group" "rds_subnet_group" { 
##  name       = "websitedatabasesubnetgroup"
##  subnet_ids = var.subnet_ids
##
##  tags = {
##    Name = "websitedatabasesubnetgroup"
##  }
##}
####creating the rds database instance
##resource "aws_db_instance" "mydbinstance" {   
##   allocated_storage    = 20
##       engine               = "mysql"
##       engine_version       = "8.0"
##       instance_class       = "db.t3.micro"
##       db_name              = "websitedatabase"
##       username             = var.db_username
##       password             = var.db_password
##       parameter_group_name = "default.mysql8.0"
##       skip_final_snapshot  = true
##       vpc_security_group_ids = [aws_security_group.rds_sg.id] ##associating RDS security group to allow access from EC2 instance
##       db_subnet_group_name = aws_db_subnet_group.rds_subnet_group.name ##ensuring RDS instance is created in the specified subnets
##       tags = {
##           Name = "websitedatabase"
##       }
##       multi_az =  false
##       availability_zone = var.availability_zone
##       publicly_accessible = false
##       
##   }

