// js/parole-soluzioni.js — Le parole da indovinare nella "Parola del giorno".
//
// 937 parole italiane comuni di cinque lettere, senza accenti, nomi propri,
// sigle o parole offensive. Sono scelte a mano fra le piu' usate secondo
// wordfreq (Robyn Speer) e controllate con il dizionario italiano di
// LibreOffice.
//
// L'ordine e' quello dei giorni e NON va cambiato: la parola di un giorno e'
// quella alla posizione (numero del giorno - 1) % lunghezza. Le parole nuove
// si aggiungono solo in fondo.
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.ParoleSoluzioni = api;
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';
  return (
    'tappe bella sordo conte feudo suino sceso pelle sigla scusa sfuso zeppo detto nocca radar ' +
    'aurea lemma denti daino sonda obolo stato sette flebo suole gorgo motto testo scale nullo ' +
    'porre acuto rebus alveo furbo sarto stile nonno amori cella masso succo tomba cervo plebe ' +
    'cause ansia apnea bende furia regio dorso umile volto bomba album fiaba dolce renna sacco ' +
    'spira piedi scope volta usare palla diodo litro vigna video liste sunto soldo conca prive ' +
    'sarta punto linea nozze morso rango frana gomma lindo porro scuse sagge petto tonda spago ' +
    'vuota zecca bimbo giada acume esche ovvio avere rospo fusto linfa brave orata colto lampo ' +
    'truce aroma ombra guaio rotto udire arena tonno purea barba circa baffo fauno calce terra ' +
    'apice scala lapis balze stufe censo netto donne agave etere lieto morte cedro opera socio ' +
    'frigo sesto gemma farsa amore epoca spese abito leale ebano edema reame rumba litio zampa ' +
    'bulbo senso stare odore massa punte letto olive abile bordo seria cifra pinta gelso cigno ' +
    'pieve busta tolto etica cielo upupa festa reale regia cacao fisse forca umano vinto copia ' +
    'ponte borgo lance tordo lunga secca mappe grano totem merce losco cenno ladro serio avuto ' +
    'secco vuote amare esile tappo valle pesce serie folla pasto curve trono culle multe tanto ' +
    'corno eremo corvo sigle volte forno magma mossa aerea gamba crisi sfera garze piena zanna ' +
    'salvo verde mania esodo greve tango antro trota scalo danza cachi bullo tenue falde zucca ' +
    'conto viste guide idolo irato fonte grado ressa sposa stufo felce messa mensa treno cauto ' +
    'zuffa abuso arduo scudo podio erede carta fatto somme amaca lungo palmo iodio olivo curia ' +
    'fieno messo amica scafo vario verbo colle botte madre burro sasso croce causa nervo baule ' +
    'bugie cuoco spose emiro elica astio nesso gonna fosco zampe copie prima piano brava annuo ' +
    'utero pesca panca salma mesto porta calda bocce pozzo chilo rosso corda beffa colla cloro ' +
    'edile molla sedia latta nuora tassa poste grave bocca pasta magro nette bello corna orafo ' +
    'pompe acida acero micio acino facce ardua fulvo palio retto testa baita mappa tasso lenza ' +
    'bozza unica fuoco risse cacce felpe paura acuta piuma opale nulla melma duomo dotto zenit ' +
    'fauna salve quota unito folto pinze terme fiele gente bonus otite amido arnia vetro tempo ' +
    'ghisa pinna sosia furto lilla sigma delta teste grumo comma fango tetro greto bassa malva ' +
    'onore manzo somma ampio udito siepe cotto sfida suora bosso afoso bieco icona manna gogna ' +
    'balia malto legge faina basso gocce isola penna ninfa sopra corso giara caldo oltre vento ' +
    'ossea torri ceppo porto curva salde ragno acaro risma balzo rauco ormai sacro soste torto ' +
    'terso buche unico zaino falsa ulivo mezzo brodo cuore prova gilet tappa ampia carro gazza ' +
    'marea aureo carpa ovile benda prole prete clero pizzo siero liceo tatto torta brado avido ' +
    'visto stola nappa lotto cosmo medie sauna pista edita palco piede flora sagra gesta usato ' +
    'arene amaro evasa lisca nuovo cicca cobra laico dogma beffe ilare pezzo istmo folle gioia ' +
    'germe grane meteo callo lieve corpo fisco aspro pacco forse sonar fiori pompa perno trave ' +
    'lembo egida largo falce larva senza umido iride gambo cuoio tutto ronda terzo vespa gemme ' +
    'latte genio lista asilo opaco tozzo costa finta forte farro spola landa soldi lepre circo ' +
    'aceto evaso mirto misto tiara agire perso fobia firme selce collo torre nadir quasi sidro ' +
    'palma pigro crema forza vello pollo prode ratto nuova cento scuro roseo asino quote clima ' +
    'dieta molto trama pegno ovino zitto selle omero preso miele leggi fogne gatto sosta coste ' +
    'stime liuto calma brano ozono breve fuori bugia robot alibi nanna aorta edito ciclo notti ' +
    'acido umida vasto suolo sorso sella omega mango culla astro cromo plico scopo brace rampe ' +
    'corto orale fitto tanfo ebbro tazza lotte reato ernia gesto cappa addio forme tombe botto ' +
    'golfo norma mirra anice rublo larga perla rozzo viole creta quale malga stelo fibra lotta ' +
    'abate fasce belva limbo fauci animo fermo abete disco degno felpa ruspe tibia dieci agile ' +
    'manto rampa rogna corta altra cassa multa edera hotel amato alato pausa nomea primo alcol ' +
    'ovale grifo marzo spada sotto ricco molle atrio panno tacco gergo samba boato padre faida ' +
    'norme lutto buono carte biada prato arido monte calmo lasso scena cocco rafia fante liana ' +
    'cavia ruote porte beato polso avaro dosso pizza lenta cacio spina fosso fetta falco micia ' +
    'sisma crine scopa mosto torso posto fiume calvo umana oliva aglio cesto buona donna stufa ' +
    'spesa cieco fughe leghe dardo ribes venia saldo milza mucca treni picco fiero atomo luogo ' +
    'pulce media aereo avena lento marmo arida danze mitra peste tasca cuneo salmo asola gnomo ' +
    'stele goffo tinca canna polpa bombe spine forze grato talpa giogo dazio osseo turbe vezzo ' +
    'omino epica ruolo fiore morbo uscio mille corsa cetra crudo bravo trame plaid toppa nafta ' +
    'museo panna viale frate soave prora vetta mamma vaghe paese calze magra corte miope metro ' +
    'dalia tinto opaca mazzo aspra matte poema oncia marca banco buffo senno vasca tigre certo ' +
    'paghe virus utile serre globo panda frase ugola fiala verme talco culto banca morto carne ' +
    'ferme estro osato arato anima malia selva casse verza unire savio epico etico avida rissa ' +
    'annua bacca retro ovest gamma santo carie dente leone ruota pazzo fossa tizio rione denso ' +
    'zolla guisa sport falso abaco razzo onere venti polpo righe ricca ambra bivio firma pesto ' +
    'notte babbo calza sodio amara ovvie azoto alone umore prosa mosso creme acqua serra pieno ' +
    'lince setta ameno borsa vuoto busto arare vasta osare esame colza audio zebre tasse rossa ' +
    'sonno cifre volpe vitto ameba altro frode ghiro marce amici cozze bosco steso mogli amico ' +
    'pigna ictus ditta guida gatti canoa esule'
  ).split(' ');
});
