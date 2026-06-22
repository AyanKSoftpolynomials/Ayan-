const prisma = require("./config/prisma");

async function main() {
  const user = await prisma.user.create({
    data: {
      name: "Admin User",
      email: "admin@test.com",
      password: "hashedpassword",
      role: "ADMIN"
    }
  });

  console.log(user);
}

main()
  .catch(console.error)
  .finally(async () => {
    await prisma.$disconnect();
  });