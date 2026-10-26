/*
 * TECHCAMPUS IoT - ESP8266MOD / NodeMCU v3
 * LCD 16x2 I2C + teclado 4x4 + HC-SR04 + servo SG90
 * + LEDs + buzzer + backend TechCampus.
 *
 * Bibliotecas:
 * - ESP8266 board package
 * - ESP8266WiFi (incluida no pacote ESP8266)
 * - ESP8266HTTPClient (incluida no pacote ESP8266)
 * - ArduinoJson (compatível com ArduinoJson 6 e 7)
 * - LiquidCrystal_I2C
 * - Adafruit MCP23017 Arduino Library
 * - Servo (ESP8266)
 *
 * IMPORTANTE:
 * Este código usa um expansor MCP23017 (endereço I2C 0x20)
 * para o teclado, LEDs e buzzer, pois o ESP8266 não tem GPIOs
 * suficientes para todos os componentes com segurança.
 *
 * I2C compartilhado:
 * LCD SDA -> D2 / GPIO4; SCL -> D1 / GPIO5
 * MCP23017 SDA -> D2 / GPIO4; SCL -> D1 / GPIO5
 *
 * ESP8266 direto:
 * HC-SR04 TRIG -> D5 / GPIO14
 * HC-SR04 ECHO -> D6 / GPIO12 (OBRIGATÓRIO divisor 5V->3,3V)
 * Servo sinal -> D7 / GPIO13
 *
 * MCP23017:
 * GPA0..GPA3 (0..3) -> linhas do teclado R1..R4
 * GPA4..GPA7 (4..7) -> colunas do teclado C1..C4
 * GPB0 (8) -> LED verde (com resistor 220-330 ohm)
 * GPB1 (9) -> LED vermelho (com resistor 220-330 ohm)
 * GPB2 (10) -> buzzer (usar driver/transistor se necessário)
 *
 * Alimentação:
 * - ESP8266 pela USB ou VIN conforme a placa.
 * - Servo por fonte regulada de 5V separada, dimensionada para o servo.
 * - GND da fonte do servo e GND do ESP8266 em comum.
 * - Confira a tensão aceita pelo módulo LCD I2C e pelo MCP23017.
 */

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_MCP23X17.h>
#include <Servo.h>

// -------- Wi-Fi e API: ALTERE ANTES DE USAR --------
const char* WIFI_SSID = "NOME_DA_REDE";
const char* WIFI_PASSWORD = "SENHA_DA_REDE";

// Use o IP local do computador que executa o TechCampus.
// Exemplo: http://192.168.1.100:3022/api
// O computador e o ESP8266 devem estar na mesma rede.
const char* API_BASE_URL = "http://192.168.1.100:3022/api";

// -------- I2C --------
const uint8_t I2C_SDA_PIN = 4;  // D2
const uint8_t I2C_SCL_PIN = 5;  // D1
const uint8_t LCD_ADDRESS = 0x27; // comum: 0x27 ou 0x3F; confirme o seu módulo
const uint8_t MCP_ADDRESS = 0x20;

LiquidCrystal_I2C lcd(LCD_ADDRESS, 16, 2);
Adafruit_MCP23X17 mcp;
Servo compartmentServo;

// -------- Pinos ESP8266 --------
const uint8_t TRIG_PIN = 14;  // D5
const uint8_t ECHO_PIN = 12;  // D6, com divisor de tensão
const uint8_t SERVO_PIN = 13; // D7

// -------- Pinos MCP23017 --------
const uint8_t ROW_PINS[4] = {0, 1, 2, 3}; // GPA0..GPA3
const uint8_t COL_PINS[4] = {4, 5, 6, 7}; // GPA4..GPA7
const uint8_t LED_GREEN_PIN = 8;  // GPB0
const uint8_t LED_RED_PIN = 9;    // GPB1
const uint8_t BUZZER_PIN = 10;    // GPB2

const char KEY_MAP[4][4] = {
  {'1', '2', '3', 'A'},
  {'4', '5', '6', 'B'},
  {'7', '8', '9', 'C'},
  {'*', '0', '#', 'D'}
};

const int SERVO_CLOSED = 0;
const int SERVO_OPEN = 90;

const float DISTANCE_PRESENT_CM = 10.0;
const float DISTANCE_CLEAR_CM = 12.0;
const unsigned long PRESENCE_TIMEOUT_MS = 15000;
const unsigned long REMOVAL_TIMEOUT_MS = 30000;
const unsigned long HTTP_TIMEOUT_MS = 5000;

String inputToken;
bool mcpReady = false;
unsigned long lastKeyMillis = 0;
char lastKey = '\0';

void showMessage(const String& line1, const String& line2 = "") {
  lcd.clear();
  lcd.setCursor(0, 0);
  lcd.print(line1.substring(0, 16));
  lcd.setCursor(0, 1);
  lcd.print(line2.substring(0, 16));
}

void showHomeScreen() {
  inputToken = "";
  showMessage("TECHCAMPUS IoT", "Digite token: ____");
}

void updateTokenScreen() {
  String line = "Token: " + inputToken;
  while (line.length() < 16) line += ' ';
  showMessage("Digite 6 numeros", line);
}

void beepShort() {
  // Buzzer ativo: pulso simples. Para buzzer passivo, pode ser
  // necessário um circuito/driver e uma implementação de tom adequada.
  mcp.digitalWrite(BUZZER_PIN, HIGH);
  delay(70);
  mcp.digitalWrite(BUZZER_PIN, LOW);
}

void signalError() {
  mcp.digitalWrite(LED_GREEN_PIN, LOW);
  mcp.digitalWrite(LED_RED_PIN, HIGH);
  mcp.digitalWrite(BUZZER_PIN, HIGH);
  delay(350);
  mcp.digitalWrite(BUZZER_PIN, LOW);
  delay(200);
  mcp.digitalWrite(LED_RED_PIN, LOW);
}

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  showMessage("Conectando Wi-Fi", "Aguarde...");
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED &&
         millis() - start < 15000) {
    delay(250);
  }

  if (WiFi.status() != WL_CONNECTED) {
    showMessage("Erro no Wi-Fi", "Verifique a rede");
    Serial.println(F("Falha na conexao Wi-Fi."));
    return false;
  }

  Serial.print(F("ESP8266 IP: "));
  Serial.println(WiFi.localIP());
  Serial.print(F("API: "));
  Serial.println(API_BASE_URL);
  return true;
}

int postJSON(const String& endpoint, const String& body, String& responseBody) {
  if (!connectWiFi()) {
    responseBody = "";
    return -1;
  }

  WiFiClient client;
  HTTPClient http;
  const String url = String(API_BASE_URL) + endpoint;

  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(client, url)) {
    responseBody = "";
    return -1;
  }

  http.addHeader("Content-Type", "application/json");
  int status = http.POST(body);
  responseBody = (status > 0) ? http.getString() : "";
  if (status <= 0) {
    Serial.print(F("Erro HTTP: "));
    Serial.println(http.errorToString(status));
  }
  http.end();

  Serial.print(F("POST "));
  Serial.print(endpoint);
  Serial.print(F(" -> HTTP "));
  Serial.println(status);
  Serial.println(responseBody);
  return status;
}

bool validateToken(const String& token, String& errorMessage) {
  if (token.length() != 6) {
    errorMessage = "Token deve ter 6 digitos";
    return false;
  }
  for (size_t i = 0; i < token.length(); i++) {
    if (!isDigit(token[i])) {
      errorMessage = "Use apenas numeros";
      return false;
    }
  }

  // DynamicJsonDocument funciona com ArduinoJson 6 e 7.
  DynamicJsonDocument requestDoc(128);
  requestDoc["token"] = token;
  String body;
  serializeJson(requestDoc, body);

  String response;
  int status = postJSON("/iot/validar", body, response);
  if (status < 0) {
    errorMessage = "Falha de comunicacao";
    return false;
  }

  DynamicJsonDocument responseDoc(768);
  if (deserializeJson(responseDoc, response)) {
    errorMessage = "Resposta invalida";
    return false;
  }

  if (status == 200 && (responseDoc["valido"] | false)) {
    return true;
  }

  errorMessage = String((const char*)(responseDoc["erro"] | "Token recusado"));
  if (errorMessage.length() > 16) errorMessage = "Token recusado";
  return false;
}

bool confirmRemoval(const String& token, String& errorMessage) {
  DynamicJsonDocument requestDoc(128);
  requestDoc["token"] = token;
  String body;
  serializeJson(requestDoc, body);

  String response;
  int status = postJSON("/iot/confirmar", body, response);
  if (status < 0) {
    errorMessage = "Falha ao confirmar";
    return false;
  }

  DynamicJsonDocument responseDoc(512);
  if (deserializeJson(responseDoc, response)) {
    errorMessage = "Resposta invalida";
    return false;
  }

  if (status == 200 && (responseDoc["ok"] | false)) return true;

  errorMessage = String((const char*)(responseDoc["erro"] | "Nao confirmado"));
  return false;
}

float getDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  unsigned long duration = pulseIn(ECHO_PIN, HIGH, 30000UL);
  if (duration == 0) return -1.0;
  return (duration * 0.0343f) / 2.0f;
}

bool waitForRemoval() {
  showMessage("Retirada", "Aguardando item");
  unsigned long start = millis();
  bool detected = false;

  while (millis() - start < PRESENCE_TIMEOUT_MS) {
    float distance = getDistanceCm();
    if (distance > 0 && distance < DISTANCE_PRESENT_CM) {
      detected = true;
      break;
    }
    delay(150);
  }

  if (!detected) {
    showMessage("Item nao visto", "Nao confirmado");
    return false;
  }

  showMessage("Item detectado", "Retire o produto");
  start = millis();
  int clearReadings = 0;

  while (millis() - start < REMOVAL_TIMEOUT_MS) {
    float distance = getDistanceCm();

    if (distance > DISTANCE_CLEAR_CM) {
      clearReadings++;
      if (clearReadings >= 3) return true;
    } else {
      // Distância próxima ou leitura inválida reinicia a sequência.
      clearReadings = 0;
    }
    delay(200);
  }

  showMessage("Tempo esgotado", "Nao confirmado");
  return false;
}

char readKeypad() {
  if (!mcpReady) return '\0';

  for (uint8_t row = 0; row < 4; row++) {
    // Todas as linhas inativas em HIGH; ativa uma linha em LOW.
    for (uint8_t r = 0; r < 4; r++) {
      mcp.digitalWrite(ROW_PINS[r], HIGH);
    }
    mcp.digitalWrite(ROW_PINS[row], LOW);
    delayMicroseconds(100);

    for (uint8_t col = 0; col < 4; col++) {
      if (mcp.digitalRead(COL_PINS[col]) == LOW) {
        char key = KEY_MAP[row][col];
        // Debounce e espera simples até soltar a tecla.
        if (millis() - lastKeyMillis < 180) return '\0';
        lastKeyMillis = millis();

        unsigned long start = millis();
        while (millis() - start < 250) {
          if (mcp.digitalRead(COL_PINS[col]) == HIGH) break;
          delay(10);
        }
        return key;
      }
    }
  }
  return '\0';
}

void verifyToken() {
  if (inputToken.length() != 6) {
    signalError();
    showMessage("Token incompleto", "Digite 6 numeros");
    delay(1600);
    showHomeScreen();
    return;
  }

  String errorMessage;
  showMessage("Validando token", "Aguarde...");
  if (!validateToken(inputToken, errorMessage)) {
    signalError();
    showMessage("Token recusado", errorMessage);
    delay(2200);
    showHomeScreen();
    return;
  }

  mcp.digitalWrite(LED_RED_PIN, LOW);
  mcp.digitalWrite(LED_GREEN_PIN, HIGH);
  mcp.digitalWrite(BUZZER_PIN, HIGH);
  delay(100);
  mcp.digitalWrite(BUZZER_PIN, LOW);

  showMessage("Token valido!", "Retire o produto");
  compartmentServo.write(SERVO_OPEN);

  bool removed = waitForRemoval();
  compartmentServo.write(SERVO_CLOSED);
  mcp.digitalWrite(LED_GREEN_PIN, LOW);

  if (!removed) {
    signalError();
    delay(1200);
    showHomeScreen();
    return;
  }

  showMessage("Registrando", "No TechCampus...");
  if (confirmRemoval(inputToken, errorMessage)) {
    mcp.digitalWrite(LED_GREEN_PIN, HIGH);
    showMessage("Retirada OK", "Pedido atualizado");
    delay(2200);
    mcp.digitalWrite(LED_GREEN_PIN, LOW);
  } else {
    signalError();
    showMessage("Falha no registro", "Verifique servidor");
    Serial.print(F("Erro confirmacao: "));
    Serial.println(errorMessage);
    delay(2500);
  }
  showHomeScreen();
}

void setup() {
  Serial.begin(115200);
  delay(100);

  pinMode(TRIG_PIN, OUTPUT);
  pinMode(ECHO_PIN, INPUT);
  digitalWrite(TRIG_PIN, LOW);

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);

  lcd.init();
  lcd.backlight();
  showMessage("TECHCAMPUS IoT", "Iniciando...");

  mcpReady = mcp.begin_I2C(MCP_ADDRESS);
  if (!mcpReady) {
    Serial.println(F("ERRO: MCP23017 nao encontrado no I2C."));
    showMessage("Erro MCP23017", "Confira ligacoes");
    while (true) delay(1000);
  }

  for (uint8_t i = 0; i < 4; i++) {
    mcp.pinMode(ROW_PINS[i], OUTPUT);
    mcp.digitalWrite(ROW_PINS[i], HIGH);
  }
  for (uint8_t i = 0; i < 4; i++) {
    mcp.pinMode(COL_PINS[i], INPUT_PULLUP);
  }

  mcp.pinMode(LED_GREEN_PIN, OUTPUT);
  mcp.pinMode(LED_RED_PIN, OUTPUT);
  mcp.pinMode(BUZZER_PIN, OUTPUT);
  mcp.digitalWrite(LED_GREEN_PIN, LOW);
  mcp.digitalWrite(LED_RED_PIN, LOW);
  mcp.digitalWrite(BUZZER_PIN, LOW);

  compartmentServo.attach(SERVO_PIN);
  compartmentServo.write(SERVO_CLOSED);

  connectWiFi();
  showHomeScreen();
}

void loop() {
  char key = readKeypad();
  if (key == '\0') {
    delay(10);
    return;
  }

  beepShort();

  if (key == '*') {
    inputToken = "";
    updateTokenScreen();
    return;
  }

  if (key == '#') {
    verifyToken();
    return;
  }

  if (key >= '0' && key <= '9' && inputToken.length() < 6) {
    inputToken += key;
    updateTokenScreen();
  }
}
