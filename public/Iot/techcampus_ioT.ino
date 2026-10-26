/*
 * ==========================================================
 * TECHCAMPUS IoT - SISTEMA DE RETIRADA DE PRODUTOS
 * ==========================================================
 *
 * Hardware:
 * - ESP32 DevKit
 * - OLED SSD1306 128x64 I2C
 * - Teclado matricial 4x4
 * - Sensor ultrassonico HC-SR04
 * - Servo motor
 * - LED verde
 * - LED vermelho
 * - Buzzer
 *
 * Integracao com o backend TechCampus:
 * POST /api/iot/validar
 * POST /api/iot/confirmar
 *
 * Fluxo:
 * 1. Aluno digita o token.
 * 2. ESP32 valida o token no servidor.
 * 3. Compartimento abre.
 * 4. Sensor acompanha a retirada.
 * 5. ESP32 confirma a retirada no servidor.
 * 6. Compartimento fecha.
 *
 * IMPORTANTE:
 * O servidor precisa estar acessivel pela mesma rede Wi-Fi.
 * Este codigo nao substitui as regras de validacao do backend.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <Keypad.h>
#include <ESP32Servo.h>

// ==========================================================
// 1. CONFIGURACAO DA REDE WI-FI
// ==========================================================

// Substitua pelos dados da sua rede.
const char* WIFI_SSID = "NOME_DA_REDE";
const char* WIFI_PASSWORD = "SENHA_DA_REDE";

// Informe o IP LOCAL do computador que executa o TechCampus.
// Exemplo: http://192.168.1.100:3022
//
// NAO use localhost ou 127.0.0.1 aqui.
// No ESP32, esses enderecos apontariam para o proprio ESP32.

const char* API_BASE_URL = "http://192.168.1.100:3022/api";

// ==========================================================
// 2. CONFIGURACAO DO DISPLAY OLED
// ==========================================================

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_ADDRESS 0x3C

Adafruit_SSD1306 display(
  SCREEN_WIDTH,
  SCREEN_HEIGHT,
  &Wire,
  -1
);

// ==========================================================
// 3. PINOS DOS COMPONENTES
// ==========================================================

#define TRIG_PIN 5
#define ECHO_PIN 18

#define LED_GREEN 19
#define LED_RED 23

#define BUZZER_PIN 4
#define SERVO_PIN 16

// ==========================================================
// 4. TECLADO MATRICIAL 4x4
// ==========================================================

const byte ROWS = 4;
const byte COLS = 4;

char keys[ROWS][COLS] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};

byte rowPins[ROWS] = {13, 12, 14, 27};
byte colPins[COLS] = {26, 25, 33, 32};

Keypad keypad = Keypad(
  makeKeymap(keys),
  rowPins,
  colPins,
  ROWS,
  COLS
);

// ==========================================================
// 5. SERVO E ESTADO DO SISTEMA
// ==========================================================

Servo myservo;

const int SERVO_CLOSED = 0;
const int SERVO_OPEN = 90;

String inputToken = "";

bool displayReady = false;

// ==========================================================
// 6. CONFIGURACAO DO SENSOR
// ==========================================================

// Distancia aproximada para identificar um objeto proximo.
const float DISTANCE_PRESENT_CM = 10.0;

// Distancia que indica que o objeto saiu da area monitorada.
const float DISTANCE_CLEAR_CM = 12.0;

// Tempo maximo para detectar a presenca de um objeto.
const unsigned long PRESENCE_TIMEOUT_MS = 15000;

// Tempo maximo para detectar a retirada.
const unsigned long REMOVAL_TIMEOUT_MS = 30000;

// Timeout de cada requisicao HTTP.
const unsigned long HTTP_TIMEOUT_MS = 5000;

// ==========================================================
// 7. FUNCOES DE INTERFACE
// ==========================================================

void showMessage(
  const String& line1,
  const String& line2 = "",
  const String& line3 = ""
) {
  if (!displayReady) {
    Serial.println(line1);
    Serial.println(line2);
    Serial.println(line3);
    return;
  }

  display.clearDisplay();

  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(0, 8);
  display.println(line1);

  display.setCursor(0, 26);
  display.println(line2);

  display.setCursor(0, 44);
  display.println(line3);

  display.display();
}

void showHomeScreen() {
  inputToken = "";

  showMessage(
    "TECHCAMPUS",
    "INSIRA O TOKEN:",
    "Use # para confirmar"
  );
}

void updateDisplayToken() {
  if (!displayReady) {
    Serial.print("Token digitado: ");
    Serial.println(inputToken);
    return;
  }

  display.clearDisplay();

  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);

  display.setCursor(10, 8);
  display.println("TECHCAMPUS");

  display.setCursor(10, 24);
  display.println("DIGITE SEU TOKEN:");

  display.setTextSize(2);
  display.setCursor(10, 42);
  display.println(inputToken);

  display.display();
}

void beepShort() {
  tone(BUZZER_PIN, 1000, 100);
}

void signalError() {
  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, HIGH);

  tone(BUZZER_PIN, 400, 500);

  delay(600);

  digitalWrite(LED_RED, LOW);
}

// ==========================================================
// 8. CONEXAO WI-FI
// ==========================================================

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) {
    return true;
  }

  showMessage(
    "TECHCAMPUS",
    "Conectando Wi-Fi...",
    "Aguarde"
  );

  Serial.println("Conectando ao Wi-Fi...");

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - start < 15000
  ) {
    delay(250);
  }

  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Falha na conexao Wi-Fi.");

    showMessage(
      "ERRO DE REDE",
      "Wi-Fi indisponivel",
      "Verifique a conexao"
    );

    return false;
  }

  Serial.print("Wi-Fi conectado. IP do ESP32: ");
  Serial.println(WiFi.localIP());

  Serial.print("Servidor configurado: ");
  Serial.println(API_BASE_URL);

  return true;
}

// ==========================================================
// 9. COMUNICACAO COM A API DO TECHCAMPUS
// ==========================================================

/*
 * Envia um POST com JSON e retorna o codigo HTTP.
 *
 * Exemplos:
 * 200 = requisicao aceita
 * 400 = dados invalidos
 * 404 = token nao encontrado
 * 409 = token nao pode ser utilizado
 * 410 = token expirado
 *
 * Um retorno negativo indica falha de comunicacao.
 */

int postJSON(
  const String& endpoint,
  const String& body,
  String& responseBody
) {
  if (!connectWiFi()) {
    responseBody = "";
    return -1;
  }

  WiFiClient client;
  HTTPClient http;

  String url = String(API_BASE_URL) + endpoint;

  http.setConnectTimeout(HTTP_TIMEOUT_MS);
  http.setTimeout(HTTP_TIMEOUT_MS);

  if (!http.begin(client, url)) {
    responseBody = "";
    return -1;
  }

  http.addHeader(
    "Content-Type",
    "application/json"
  );

  int statusCode = http.POST(body);

  if (statusCode > 0) {
    responseBody = http.getString();
  } else {
    responseBody = "";

    Serial.print("Erro HTTP: ");
    Serial.println(http.errorToString(statusCode));
  }

  http.end();

  Serial.print("Endpoint: ");
  Serial.println(endpoint);

  Serial.print("HTTP: ");
  Serial.println(statusCode);

  Serial.print("Resposta: ");
  Serial.println(responseBody);

  return statusCode;
}

// ==========================================================
// 10. VALIDACAO DO TOKEN NO SERVIDOR
// ==========================================================

bool validateToken(
  const String& token,
  String& errorMessage
) {
  if (token.length() != 6) {
    errorMessage = "O token deve ter 6 digitos.";
    return false;
  }

  // Impede o envio de letras ou caracteres inesperados.
  for (unsigned int i = 0; i < token.length(); i++) {
    if (!isDigit(token[i])) {
      errorMessage = "Token deve conter numeros.";
      return false;
    }
  }

  // Escapa corretamente a string JSON.
  JsonDocument requestDoc;
  requestDoc["token"] = token;

  String requestBody;
  serializeJson(requestDoc, requestBody);

  String responseBody;

  int status = postJSON(
    "/iot/validar",
    requestBody,
    responseBody
  );

  if (status < 0) {
    errorMessage = "Falha na comunicacao.";
    return false;
  }

  JsonDocument responseDoc;

  DeserializationError jsonError =
    deserializeJson(responseDoc, responseBody);

  if (jsonError) {
    errorMessage = "Resposta invalida do servidor.";
    return false;
  }

  bool valid = responseDoc["valido"] | false;

  if (status == 200 && valid) {
    Serial.println("Token validado pelo TechCampus.");

    if (responseDoc["pedidoId"].is<int>()) {
      Serial.print("Pedido: #");
      Serial.println(
        responseDoc["pedidoId"].as<int>()
      );
    }

    if (responseDoc["produtos"].is<const char*>()) {
      Serial.print("Produtos: ");
      Serial.println(
        responseDoc["produtos"].as<const char*>()
      );
    }

    return true;
  }

  const char* serverError =
    responseDoc["erro"] | "Token nao autorizado.";

  errorMessage = String(serverError);

  return false;
}

// ==========================================================
// 11. CONFIRMACAO DA RETIRADA NO SERVIDOR
// ==========================================================

bool confirmRemoval(
  const String& token,
  String& errorMessage
) {
  JsonDocument requestDoc;
  requestDoc["token"] = token;

  String requestBody;
  serializeJson(requestDoc, requestBody);

  String responseBody;

  int status = postJSON(
    "/iot/confirmar",
    requestBody,
    responseBody
  );

  if (status < 0) {
    errorMessage = "Falha ao confirmar retirada.";
    return false;
  }

  JsonDocument responseDoc;

  DeserializationError jsonError =
    deserializeJson(responseDoc, responseBody);

  if (jsonError) {
    errorMessage = "Resposta invalida do servidor.";
    return false;
  }

  bool confirmed = responseDoc["ok"] | false;

  if (status == 200 && confirmed) {
    Serial.println("Retirada registrada no TechCampus.");
    return true;
  }

  const char* serverError =
    responseDoc["erro"] | "Retirada nao confirmada.";

  errorMessage = String(serverError);

  return false;
}

// ==========================================================
// 12. LEITURA DO SENSOR ULTRASSONICO
// ==========================================================

float getDistance() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);

  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);

  digitalWrite(TRIG_PIN, LOW);

  // Timeout de 30 ms para evitar espera indefinida.
  unsigned long duration = pulseIn(
    ECHO_PIN,
    HIGH,
    30000
  );

  if (duration == 0) {
    return -1.0;
  }

  return (duration * 0.0343) / 2.0;
}

// ==========================================================
// 13. DETECCAO DA RETIRADA DO PRODUTO
// ==========================================================

/*
 * Primeiro, aguarda o sensor detectar um objeto proximo.
 *
 * Depois, aguarda o objeto sair da area monitorada.
 *
 * Leituras invalidas nao sao consideradas prova de retirada.
 *
 * O sistema nao confirma a retirada se o sensor nao
 * conseguir observar a sequencia esperada.
 */

bool waitForRemoval() {
  unsigned long start = millis();

  bool objectDetected = false;

  showMessage(
    "RETIRADA",
    "Aguardando objeto...",
    "Nao feche o sistema"
  );

  // Etapa 1: detectar a presenca de um objeto.
  while (
    millis() - start < PRESENCE_TIMEOUT_MS
  ) {
    float distance = getDistance();

    if (
      distance > 0 &&
      distance < DISTANCE_PRESENT_CM
    ) {
      objectDetected = true;
      break;
    }

    delay(150);
  }

  if (!objectDetected) {
    Serial.println("Objeto nao detectado.");

    showMessage(
      "ATENCAO",
      "Objeto nao detectado",
      "Retirada nao confirmada"
    );

    return false;
  }

  showMessage(
    "RETIRADA",
    "Objeto detectado",
    "Aguardando retirada"
  );

  // Etapa 2: detectar a saida do objeto.
  start = millis();

  int clearReadings = 0;

  while (
    millis() - start < REMOVAL_TIMEOUT_MS
  ) {
    float distance = getDistance();

    if (
      distance > DISTANCE_CLEAR_CM
    ) {
      clearReadings++;

      // Exige varias leituras consecutivas.
      if (clearReadings >= 3) {
        Serial.println("Retirada detectada.");
        return true;
      }
    } else if (distance > 0) {
      // O objeto continua proximo.
      clearReadings = 0;
    }

    // Uma leitura invalida nao confirma retirada.
    delay(200);
  }

  Serial.println("Tempo esgotado aguardando retirada.");

  showMessage(
    "TEMPO ESGOTADO",
    "Retirada nao detectada",
    "Pedido nao confirmado"
  );

  return false;
}

// ==========================================================
// 14. PROCESSAMENTO DO TOKEN
// ==========================================================

void verifyToken() {
  if (inputToken.length() != 6) {
    signalError();

    showMessage(
      "TOKEN INCOMPLETO",
      "Digite 6 numeros",
      "Use * para limpar"
    );

    delay(1800);

    showHomeScreen();
    return;
  }

  String errorMessage;

  showMessage(
    "TECHCAMPUS",
    "Validando token...",
    "Aguarde"
  );

  // A API precisa autorizar o token antes de abrir.
  if (!validateToken(inputToken, errorMessage)) {
    Serial.print("Token recusado: ");
    Serial.println(errorMessage);

    signalError();

    showMessage(
      "TOKEN RECUSADO",
      errorMessage,
      "Consulte a AAPM"
    );

    delay(2500);

    showHomeScreen();
    return;
  }

  // Token validado: abre o compartimento.
  digitalWrite(LED_RED, LOW);
  digitalWrite(LED_GREEN, HIGH);

  tone(BUZZER_PIN, 2000, 300);

  showMessage(
    "TOKEN VALIDO!",
    "Retire o produto",
    "Aguardando sensor..."
  );

  myservo.write(SERVO_OPEN);

  // Aguarda a retirada fisica.
  bool removed = waitForRemoval();

  // Fecha o compartimento independentemente do resultado.
  myservo.write(SERVO_CLOSED);

  digitalWrite(LED_GREEN, LOW);

  if (!removed) {
    /*
     * O sensor nao confirmou a retirada.
     * Por seguranca, nao enviamos a confirmacao.
     *
     * O pedido nao deve ser marcado como entregue.
     */
    signalError();

    delay(1500);

    showHomeScreen();
    return;
  }

  // Somente agora solicitamos a confirmacao ao servidor.
  showMessage(
    "RETIRADA DETECTADA",
    "Registrando no",
    "TechCampus..."
  );

  if (confirmRemoval(inputToken, errorMessage)) {
    tone(BUZZER_PIN, 2000, 300);

    showMessage(
      "RETIRADA CONCLUIDA",
      "Pedido atualizado",
      "TechCampus"
    );

    Serial.println(
      "Sucesso: pedido marcado como entregue."
    );

  } else {
    /*
     * O objeto pode ter sido retirado fisicamente,
     * mas o servidor nao confirmou a operacao.
     *
     * Nao afirmamos que o pedido foi registrado.
     * A situacao deve ser verificada no backend.
     */
    signalError();

    showMessage(
      "ATENCAO",
      "Falha ao registrar",
      "Verifique o servidor"
    );

    Serial.print("Erro de confirmacao: ");
    Serial.println(errorMessage);
  }

  delay(2500);

  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, LOW);

  showHomeScreen();
}

// ==========================================================
// 15. INICIALIZACAO
// ==========================================================

void setup() {
  Serial.begin(115200);

  pinMode(LED_GREEN, OUTPUT);
  pinMode(LED_RED, OUTPUT);
  pinMode(BUZZER_PIN, OUTPUT);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);

  digitalWrite(LED_GREEN, LOW);
  digitalWrite(LED_RED, LOW);
  digitalWrite(TRIG_PIN, LOW);

  myservo.attach(SERVO_PIN);
  myservo.write(SERVO_CLOSED);

  Wire.begin();

  displayReady = display.begin(
    SSD1306_SWITCHCAPVCC,
    OLED_ADDRESS
  );

  if (!displayReady) {
    Serial.println(
      "Falha ao inicializar o display OLED."
    );
  }

  showMessage(
    "TECHCAMPUS",
    "Iniciando sistema...",
    "IoT"
  );

  connectWiFi();

  showHomeScreen();
}

// ==========================================================
// 16. LOOP PRINCIPAL
// ==========================================================

void loop() {
  char key = keypad.getKey();

  if (!key) {
    delay(10);
    return;
  }

  beepShort();

  if (key == '*') {
    // Limpa o token digitado.
    inputToken = "";
    updateDisplayToken();
    return;
  }

  if (key == '#') {
    // Confirma a digitacao.
    verifyToken();
    return;
  }

  // Aceita somente numeros de 0 a 9.
  if (key >= '0' && key <= '9') {
    if (inputToken.length() < 6) {
      inputToken += key;
      updateDisplayToken();
    }

    return;
  }

  // Teclas A, B, C e D nao fazem parte do token.
  Serial.println("Tecla ignorada.");
}