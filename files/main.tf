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

provider "aws" {
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

# S3 bucket (versioned, private, deletable by Terraform)
resource "aws_s3_bucket" "AppImagesBucket" {
    bucket = "appimagesbucket-1234567890"
    acl    = "private"

    versioning {
        enabled = true
    }

    force_destroy = true

    tags = {
        Name        = "appimagesbucket-1234567890"
    }
}


# EC2 instance (simple webserver)
resource "aws_instance" "tf-web-instance" {
    ami                    = data.aws_ami.amazon_linux_2.id
    instance_type          = "t2.micro"

    
    tags = {
        Name        = "tf-web-instance"
    }
}
