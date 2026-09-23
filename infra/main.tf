resource "random_id" "this" {
  byte_length = 4

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}

resource "random_pet" "this" {
  length    = 3
  separator = "-"

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}

# Signs the core service's access tokens (JWT_SECRET, HS256). Every Lambda instance
# must share it, or a token from one instance fails on the next. Stored in Terraform
# state like the database password. Replacing it signs every user out.
resource "random_password" "jwt_secret" {
  length  = 64
  special = false

  keepers = {
    seed_input = try(var.aws_app_code, terraform.workspace)
  }
}
