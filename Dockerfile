# Bước 1: Dùng môi trường Maven để build backend
FROM maven:3.8.5-openjdk-17 AS build
WORKDIR /app

# Sao chép toàn bộ thư mục backend vào trong container
COPY backend/ ./backend/

# Di chuyển vào đúng thư mục backend (nơi có file pom.xml) để build
WORKDIR /app/backend
RUN mvn clean package -DskipTests

# Bước 2: Dùng môi trường Java 17 siêu nhẹ để chạy ứng dụng
FROM eclipse-temurin:17-jre-alpine
WORKDIR /app

# Sao chép file .jar từ thư mục target của backend sang
COPY --from=build /app/backend/target/soundbook-backend-0.0.1-SNAPSHOT.jar app.jar

# Khai báo cổng chạy ứng dụng
EXPOSE 8081

ENTRYPOINT ["java", "-jar", "app.jar"]