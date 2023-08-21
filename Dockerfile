# Node.js 공식 이미지를 베이스로 사용
FROM node:18.16.0

# 작업 디렉토리 설정
WORKDIR /usr/src/app

# 애플리케이션 파일들을 컨테이너에 복사
COPY package*.json ./

# 의존성 패키지 설치
RUN npm install

# 소스 코드 복사
COPY . .

# 서버가 사용할 포트 설정
EXPOSE 4000

# 애플리케이션 실행
CMD [ "npm", "start" ]
