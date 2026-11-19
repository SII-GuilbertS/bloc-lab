/*
  IA + Arduino : récepteur de commandes (Arduino Uno / Nano / Mega)

  À téléverser UNE SEULE FOIS dans la carte.
  Ensuite, c'est la page web « ia-arduino.html » qui pilote la carte par USB.

  Commandes reçues sur le port série (115200 bauds), une par ligne :
    L,<broche>,<0|1>        LED / sortie numérique (0 = éteinte, 1 = allumée)
    S,<broche>,<0..180>     servomoteur (angle en degrés)
    P,<broche>,<0..255>     sortie PWM (luminosité, vitesse d'un moteur...)
    R,<broche>,0            lecture : la carte répond « R,<broche>,<0|1> »
    ?                       la carte répond « PRET »

  Broches autorisées : 2 à 19 (les broches 0 et 1 servent à l'USB).
  Jusqu'à 6 servomoteurs.
*/

#include <Servo.h>

const unsigned long VITESSE = 115200;
const byte NB_SERVOS = 6;

Servo servos[NB_SERVOS];
int brochesServo[NB_SERVOS];

char tampon[24];
byte nb = 0;

void setup() {
  Serial.begin(VITESSE);
  for (byte i = 0; i < NB_SERVOS; i++) {
    brochesServo[i] = -1;
  }
  Serial.println(F("PRET"));
}

void loop() {
  while (Serial.available() > 0) {
    char c = Serial.read();
    if (c == '\n') {
      tampon[nb] = '\0';
      traiter();
      nb = 0;
    } else if (c != '\r') {
      if (nb < sizeof(tampon) - 1) {
        tampon[nb++] = c;
      }
    }
  }
}

void commanderServo(int broche, int angle) {
  int index = -1;
  for (byte i = 0; i < NB_SERVOS; i++) {
    if (brochesServo[i] == broche) {
      index = i;
      break;
    }
  }
  if (index < 0) {
    for (byte i = 0; i < NB_SERVOS; i++) {
      if (brochesServo[i] < 0) {
        index = i;
        servos[i].attach(broche);
        brochesServo[i] = broche;
        break;
      }
    }
  }
  if (index >= 0) {
    servos[index].write(angle);
  }
}

void traiter() {
  if (tampon[0] == '?') {
    Serial.println(F("PRET"));
    return;
  }
  char type = tampon[0];
  if (tampon[1] != ',') return;

  char *fin;
  long a = strtol(tampon + 2, &fin, 10);
  if (*fin != ',') return;
  long b = strtol(fin + 1, &fin, 10);

  if (a < 2 || a > 19) return;

  switch (type) {
    case 'L':
      pinMode(a, OUTPUT);
      digitalWrite(a, b ? HIGH : LOW);
      break;
    case 'S':
      commanderServo(a, constrain(b, 0, 180));
      break;
    case 'P':
      pinMode(a, OUTPUT);
      analogWrite(a, constrain(b, 0, 255));
      break;
    case 'R':  // lecture : "R,broche,0" -> répond "R,broche,0|1"
      pinMode(a, INPUT);
      Serial.print(F("R,"));
      Serial.print(a);
      Serial.print(',');
      Serial.println(digitalRead(a));
      break;
  }
}
