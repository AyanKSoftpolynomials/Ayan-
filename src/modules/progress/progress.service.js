const prisma = require("../../config/database");

const completeLesson = async (
  userId,
  lessonId
) => {
  return prisma.progress.upsert({
    where: {
      userId_lessonId: {
        userId,
        lessonId
      }
    },
    update: {
      completed: true,
      completedAt: new Date()
    },
    create: {
      userId,
      lessonId,
      completed: true,
      completedAt: new Date()
    }
  });
};

const getCourseProgress = async (
  userId,
  courseId
) => {
  const lessons =
    await prisma.lesson.findMany({
      where: {
        module: {
          courseId
        }
      },
      select: {
        id: true
      }
    });

  const lessonIds = lessons.map(
    (lesson) => lesson.id
  );

  const completedLessons =
    await prisma.progress.count({
      where: {
        userId,
        lessonId: {
          in: lessonIds
        },
        completed: true
      }
    });

  const totalLessons =
    lessons.length;

  const percentage =
    totalLessons === 0
      ? 0
      : Math.round(
          (completedLessons /
            totalLessons) *
            100
        );

  return {
    totalLessons,
    completedLessons,
    percentage
  };
};

module.exports = {
  completeLesson,
  getCourseProgress
};